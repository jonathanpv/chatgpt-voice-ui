import { RealtimeItem, tool } from '@openai/agents/realtime';

import { addTodoItem, getTodoItems, toggleTodoItem } from '@/app/lib/todoStore';

export const supervisorAgentInstructions = `You are an expert Todo App supervisor agent, tasked with providing real-time guidance to a more junior agent that's chatting directly with the user. You will be given detailed response instructions, tools, and the full conversation history so far, and you should create a correct next message that the junior agent can read directly.

# Instructions
- You can provide an answer directly, or call a tool first and then answer the question.
- If you need to call a tool, but don't have the right information, ask the user for that information in your message.
- Your message will be read verbatim by the junior agent, so write like you're speaking to the user.

==== Domain-Specific Agent Instructions ====
You are a helpful assistant for a Todo App. Provide concise, helpful guidance. Use tools for TODO management.

# Tool Use Rules
- Use getTodoList/addTodoItem/completeTodoItem for task management requests.
- If a tool requires missing input (e.g., text for a new todo), ask for it.

# Response Style
- Be concise and conversational. No bullet lists.
- Avoid speculation. If you cannot fulfill a request with the tools, say so.
- When you use tool results, weave them into a short, clear response.

# Example (tool call)
- User: Add buy milk to my list
- Supervisor Assistant: addTodoItem(text="buy milk")
- addTodoItem(): { items: [...] }
- Supervisor Assistant:
# Message
Done. I've added "buy milk" to your list.
`;

export const supervisorAgentTools = [
  {
    type: "function",
    name: "getTodoList",
    description:
      "Return the user's current TODO list.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "addTodoItem",
    description: "Add a TODO item to the user's list.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Short TODO item text.",
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "completeTodoItem",
    description: "Mark a TODO item as completed or not completed.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The TODO item id to update.",
        },
        completed: {
          type: "boolean",
          description: "Optional completion state. Defaults to toggling.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

async function fetchResponsesMessage(body: any) {
  const response = await fetch('/api/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // Preserve the previous behaviour of forcing sequential tool calls.
    body: JSON.stringify({ ...body, parallel_tool_calls: false }),
  });

  if (!response.ok) {
    return { error: 'Something went wrong.' };
  }

  const completion = await response.json();
  return completion;
}

async function getToolResponse(fName: string, args: any) {
  switch (fName) {
    case "getTodoList": {
      return { items: getTodoItems() };
    }
    case "addTodoItem": {
      const text = String(args?.text ?? "").trim();
      if (!text) return { items: getTodoItems(), error: "Todo text required." };
      return { items: addTodoItem(text) };
    }
    case "completeTodoItem": {
      const id = String(args?.id ?? "").trim();
      if (!id) return { items: getTodoItems(), error: "Todo id required." };
      return { items: toggleTodoItem(id, args?.completed) };
    }
    default:
      return { result: true };
  }
}

/**
 * Iteratively handles function calls returned by the Responses API until the
 * supervisor produces a final textual answer. Returns that answer as a string.
 */
async function handleToolCalls(
  body: any,
  response: any,
  addBreadcrumb?: (title: string, data?: any) => void,
) {
  let currentResponse = response;

  while (true) {
    if (currentResponse?.error) {
      return { error: 'Something went wrong.' } as any;
    }

    const outputItems: any[] = currentResponse.output ?? [];

    // Gather all function calls in the output.
    const functionCalls = outputItems.filter((item) => item.type === 'function_call');

    if (functionCalls.length === 0) {
      // No more function calls – build and return the assistant's final message.
      const assistantMessages = outputItems.filter((item) => item.type === 'message');

      const finalText = assistantMessages
        .map((msg: any) => {
          const contentArr = msg.content ?? [];
          return contentArr
            .filter((c: any) => c.type === 'output_text')
            .map((c: any) => c.text)
            .join('');
        })
        .join('\n');

      return finalText;
    }

    // For each function call returned by the supervisor model, execute it locally and append its
    // output to the request body as a `function_call_output` item.
    for (const toolCall of functionCalls) {
      const fName = toolCall.name;
      const args = JSON.parse(toolCall.arguments || '{}');
      const toolRes = await getToolResponse(fName, args);

      // Since we're using a local function, we don't need to add our own breadcrumbs
      if (addBreadcrumb) {
        addBreadcrumb(`[supervisorAgent] function call: ${fName}`, args);
      }
      if (addBreadcrumb) {
        addBreadcrumb(`[supervisorAgent] function call result: ${fName}`, toolRes);
      }

      // Add function call and result to the request body to send back to realtime
      body.input.push(
        {
          type: 'function_call',
          call_id: toolCall.call_id,
          name: toolCall.name,
          arguments: toolCall.arguments,
        },
        {
          type: 'function_call_output',
          call_id: toolCall.call_id,
          output: JSON.stringify(toolRes),
        },
      );
    }

    // Make the follow-up request including the tool outputs.
    currentResponse = await fetchResponsesMessage(body);
  }
}

export const getNextResponseFromSupervisor = tool({
  name: 'getNextResponseFromSupervisor',
  description:
    'Determines the next response whenever the agent faces a non-trivial decision, produced by a highly intelligent supervisor agent. Returns a message describing what to do next.',
  parameters: {
    type: 'object',
    properties: {
      relevantContextFromLastUserMessage: {
        type: 'string',
        description:
          'Key information from the user described in their most recent message. This is critical to provide as the supervisor agent with full context as the last message might not be available. Okay to omit if the user message didn\'t add any new information.',
      },
    },
    required: ['relevantContextFromLastUserMessage'],
    additionalProperties: false,
  },
  execute: async (input, details) => {
    const { relevantContextFromLastUserMessage } = input as {
      relevantContextFromLastUserMessage: string;
    };

    const addBreadcrumb = (details?.context as any)?.addTranscriptBreadcrumb as
      | ((title: string, data?: any) => void)
      | undefined;

    const history: RealtimeItem[] = (details?.context as any)?.history ?? [];
    const filteredLogs = history.filter((log) => log.type === 'message');

    const body: any = {
      model: 'gpt-4.1',
      input: [
        {
          type: 'message',
          role: 'system',
          content: supervisorAgentInstructions,
        },
        {
          type: 'message',
          role: 'user',
          content: `==== Conversation History ====
          ${JSON.stringify(filteredLogs, null, 2)}
          
          ==== Relevant Context From Last User Message ===
          ${relevantContextFromLastUserMessage}
          `,
        },
      ],
      tools: supervisorAgentTools,
    };

    const response = await fetchResponsesMessage(body);
    if (response.error) {
      return { error: 'Something went wrong.' };
    }

    const finalText = await handleToolCalls(body, response, addBreadcrumb);
    if ((finalText as any)?.error) {
      return { error: 'Something went wrong.' };
    }

    return { nextResponse: finalText as string };
  },
});
  
