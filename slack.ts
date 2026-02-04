import * as dotenv from "dotenv";
dotenv.config();

const SLACK_API_BASE = "https://slack.com/api";
const SLACK_GET_UPLOAD_URL = `${SLACK_API_BASE}/files.getUploadURLExternal`;
const SLACK_COMPLETE_UPLOAD = `${SLACK_API_BASE}/files.completeUploadExternal`;
const SLACK_POST_MESSAGE = `${SLACK_API_BASE}/chat.postMessage`;

const ENV_SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const ENV_CHANNEL = process.env.SLACK_CHANNEL_ID;

const sendImageToSlack = async ({
  base64fromImage,
  filename = "lotto.png",
  filetype = "image/png",
  message = "오늘의 로또가 발급됐읍니다. (https://dhlottery.co.kr/myPage.do?method=lottoBuyListView)",
  title = "오늘의 로또",
}: {
  base64fromImage: string;
  filename?: string;
  filetype?: string;
  title?: string;
  message?: string;
}) => {
  if (ENV_SLACK_BOT_TOKEN === undefined || ENV_CHANNEL === undefined) {
    throw new Error(
      `SLACK_BOT_TOKEN, SLACK_CHANNEL must be defined in .env file`,
    );
  }

  console.log(`SLACK_CHANNEL => ${ENV_CHANNEL}`);

  const buffer: Buffer = Buffer.from(base64fromImage, "base64");
  const fileSize = buffer.length;

  try {
    // Step 1: Get upload URL (Slack accepts form-urlencoded or JSON; form is widely used)
    console.log("[Slack] Step 1: Getting upload URL...");
    const lengthNum = Number(fileSize);
    if (!Number.isInteger(lengthNum) || lengthNum <= 0) {
      throw new Error(`Invalid file length: ${fileSize}`);
    }

    // files.getUploadURLExternal은 application/x-www-form-urlencoded만 파싱함 (JSON 시 filename/length 미수신)
    const formBody = new URLSearchParams();
    formBody.set("filename", filename);
    formBody.set("length", String(lengthNum));

    const getUploadUrlResponse = await fetch(SLACK_GET_UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV_SLACK_BOT_TOKEN}`,
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: formBody.toString(),
    });

    if (!getUploadUrlResponse.ok) {
      const errorText = await getUploadUrlResponse.text();
      throw new Error(
        `Failed to get upload URL: ${getUploadUrlResponse.status} ${errorText}`,
      );
    }

    const uploadData = (await getUploadUrlResponse.json()) as {
      ok: boolean;
      error?: string;
      upload_url?: string;
      file_id?: string;
      response_metadata?: { messages?: string[] };
    };

    if (!uploadData.ok) {
      const errMsg = uploadData.error || "Unknown error";
      const errDetail =
        uploadData.response_metadata?.messages?.join("; ") || "";
      console.error(
        "[Slack] getUploadURLExternal response:",
        JSON.stringify(uploadData),
      );
      throw new Error(
        `Slack API error: ${errMsg}${errDetail ? ` (${errDetail})` : ""}`,
      );
    }

    const upload_url = uploadData.upload_url;
    const file_id = uploadData.file_id;
    if (!upload_url || !file_id) {
      console.error(
        "[Slack] getUploadURLExternal response:",
        JSON.stringify(uploadData),
      );
      throw new Error("Slack API did not return upload_url or file_id");
    }

    // Step 2: Upload file to the URL
    console.log("[Slack] Step 2: Uploading file...");
    const uploadResponse = await fetch(upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": filetype,
      },
      body: new Uint8Array(buffer),
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(
        `Failed to upload file: ${uploadResponse.status} ${errorText}`,
      );
    }

    // Step 3: Complete upload
    console.log("[Slack] Step 3: Completing upload...");
    const completeResponse = await fetch(SLACK_COMPLETE_UPLOAD, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV_SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: [
          {
            id: file_id,
            title: title,
          },
        ],
        channel_id: ENV_CHANNEL,
        initial_comment: message,
      }),
    });

    if (!completeResponse.ok) {
      const errorText = await completeResponse.text();
      throw new Error(
        `Failed to complete upload: ${completeResponse.status} ${errorText}`,
      );
    }

    const completeData = await completeResponse.json();

    if (!completeData.ok) {
      throw new Error(
        `Slack API error: ${completeData.error || "Unknown error"}`,
      );
    }

    console.log(`[${ENV_CHANNEL}] Send image to slack completed!`);
  } catch (error) {
    console.error("Error sending image to Slack:", error);
    throw error;
  }
};

const sendMessageToSlack = async ({ message }: { message: string }) => {
  if (ENV_SLACK_BOT_TOKEN === undefined || ENV_CHANNEL === undefined) {
    throw new Error(
      `SLACK_BOT_TOKEN, SLACK_CHANNEL must be defined in .env file`,
    );
  }

  console.log(`SLACK_CHANNEL => ${ENV_CHANNEL}`);

  try {
    const response = await fetch(SLACK_POST_MESSAGE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV_SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: ENV_CHANNEL,
        text: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to send message: ${response.status} ${errorText}`,
      );
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error || "Unknown error"}`);
    }

    console.log(`[${ENV_CHANNEL}] Send message to slack completed!`);
  } catch (error) {
    console.error("Error sending message to Slack:", error);
    throw error;
  }
};

export { sendImageToSlack, sendMessageToSlack };
