import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const resolveLogFilePath = () => {
  const rawPath = process.env.APP_LOG_FILE_PATH;
  if (rawPath) {
    return path.resolve(process.cwd(), rawPath);
  }
  return path.join(process.cwd(), ".logs", "logs.txt");
};

export async function POST(req: NextRequest) {
  try {
    const logFilePath = resolveLogFilePath();

    const payload = await req.json();
    const entry = `${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...payload,
    })}\n`;

    await fs.mkdir(path.dirname(logFilePath), { recursive: true });
    await fs.appendFile(logFilePath, entry, "utf8");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to write logs.txt", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
