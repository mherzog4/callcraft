import fs from "node:fs/promises";
import path from "node:path";
import { WebClient } from "@slack/web-api";
import { renderDraftBlocks } from "./render";
import type { CallSummary, EmailDraft, GongContext } from "@/src/domain/schemas";

export interface SlackDeliveryInput {
  callId: string;
  draftId: string;
  sellerSlackUserId: string;
  title: string;
  gongUrl: string;
  context: GongContext | null;
  summary: CallSummary;
  draft: EmailDraft;
  status?: string;
  allowSend?: boolean;
  previous?: { channelId: string; messageTs: string };
}
export interface SlackDeliveryResult {
  channelId: string;
  messageTs: string;
}
export interface SlackDraftDestination {
  deliver(input: SlackDeliveryInput): Promise<SlackDeliveryResult>;
}

export class SlackDestination implements SlackDraftDestination {
  private readonly client: WebClient;
  constructor(token: string) {
    this.client = new WebClient(token);
  }
  async deliver(input: SlackDeliveryInput): Promise<SlackDeliveryResult> {
    const blocks = renderDraftBlocks(input);
    if (input.previous) {
      await this.client.chat.update({
        channel: input.previous.channelId,
        ts: input.previous.messageTs,
        text: `Follow-up draft for ${input.title}`,
        blocks,
      });
      return input.previous;
    }
    const result = await this.client.chat.postMessage({
      channel: input.sellerSlackUserId,
      text: `Follow-up draft for ${input.title}`,
      blocks,
    });
    if (!result.channel || !result.ts)
      throw new Error("Slack response did not include message identity");
    return { channelId: result.channel, messageTs: result.ts };
  }
}

export class PreviewSlackDestination implements SlackDraftDestination {
  constructor(private readonly directory = "./data/previews") {}
  async deliver(input: SlackDeliveryInput): Promise<SlackDeliveryResult> {
    await fs.mkdir(this.directory, { recursive: true });
    const messageTs = input.previous?.messageTs ?? `${Date.now()}.000000`;
    const channelId = "local-preview";
    await fs.writeFile(
      path.join(this.directory, `slack-${input.draftId}.json`),
      JSON.stringify(
        { text: `Follow-up draft for ${input.title}`, blocks: renderDraftBlocks(input) },
        null,
        2,
      ),
    );
    return { channelId, messageTs };
  }
}
