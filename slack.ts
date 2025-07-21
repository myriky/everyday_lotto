import * as dotenv from "dotenv";
dotenv.config();

const SLACK_UPLOAD_API_URL = "https://slack.com/api/files.upload";
const SLACK_WRITE_API_URL = "https://slack.com/api/chat.postMessage";

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
      `SLACK_BOT_TOKEN, SLACK_CHANNEL must be defined in .env file`
    );
  }

  console.log(`SLACK_BOT_TOKEN => ${ENV_SLACK_BOT_TOKEN}`);
  console.log(`SLACK_CHANNEL => ${ENV_CHANNEL}`);

  const buffer: Buffer = Buffer.from(base64fromImage, "base64");

  const formData = new FormData();
  formData.append("channels", ENV_CHANNEL);
  formData.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: filetype }),
    filename
  );
  formData.append("filename", filename);
  formData.append("filetype", filetype);
  formData.append("token", ENV_SLACK_BOT_TOKEN);
  formData.append("initial_comment", message);
  formData.append("title", title);

  try {
    const response = await fetch(SLACK_UPLOAD_API_URL, {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      console.log(`[${ENV_CHANNEL}] Send image to slack completed!`);
    } else {
      console.error(
        `Failed to send image: ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    console.error("Error sending image to Slack:", error);
  }
};

const sendMessageToSlack = async ({ message }: { message: string }) => {
  if (ENV_SLACK_BOT_TOKEN === undefined || ENV_CHANNEL === undefined) {
    throw new Error(
      `SLACK_BOT_TOKEN, SLACK_CHANNEL must be defined in .env file`
    );
  }

  console.log(`SLACK_BOT_TOKEN => ${ENV_SLACK_BOT_TOKEN}`);
  console.log(`SLACK_CHANNEL => ${ENV_CHANNEL}`);

  const formData = new FormData();
  formData.append("channel", ENV_CHANNEL);
  formData.append("text", message);
  formData.append("token", ENV_SLACK_BOT_TOKEN);

  try {
    const response = await fetch(SLACK_WRITE_API_URL, {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      console.log(`[${ENV_CHANNEL}] Send message to slack completed!`);
    } else {
      console.error(
        `Failed to send message: ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    console.error("Error sending message to Slack:", error);
  }
};

export { sendImageToSlack, sendMessageToSlack };
