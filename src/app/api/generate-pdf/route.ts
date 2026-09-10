import { NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TEMPLATE_URL = "https://akturio.com/akturio-vertrag.html";

export async function POST() {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  try {
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.default.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-zygote",
      ],
    });

    try {
      const page = await browser.newPage();
      await page.goto(TEMPLATE_URL, { waitUntil: "networkidle2", timeout: 60000 });
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
      });
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: { "Content-Type": "application/pdf" },
      });
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error("PDF-Generierung fehlgeschlagen:", err);
    return NextResponse.json({ error: "PDF-Generierung fehlgeschlagen" }, { status: 500 });
  }
}
