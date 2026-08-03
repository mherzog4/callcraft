import { z } from "zod";
import type { GongAdapter, GongCallPage, GongUser } from "./contract";
import { GongError } from "./contract";
import { GongHttpClient } from "./client";
import {
  callsResponseSchema,
  extensiveResponseSchema,
  transcriptResponseSchema,
  usersResponseSchema,
} from "./schemas";
import type {
  GongContext,
  NormalizedCall,
  Participant,
  TranscriptSegment,
} from "@/src/domain/schemas";

const iso = (date: Date) => date.toISOString();
export class RealGongAdapter implements GongAdapter {
  constructor(private readonly client: GongHttpClient) {}

  async listUsers(): Promise<GongUser[]> {
    const users: GongUser[] = [];
    let cursor: string | undefined;
    do {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const { data } = await this.client.request<unknown>(`/v2/users${query}`);
      const page = usersResponseSchema.parse(data);
      users.push(
        ...page.users.map((user) => ({
          id: user.id,
          email: user.emailAddress,
          firstName: user.firstName,
          lastName: user.lastName,
          active: user.active,
        })),
      );
      cursor = page.records?.cursor;
    } while (cursor);
    return users;
  }

  async listCalls(input: { from: Date; to: Date; cursor?: string }): Promise<GongCallPage> {
    const query = new URLSearchParams({ fromDateTime: iso(input.from), toDateTime: iso(input.to) });
    if (input.cursor) query.set("cursor", input.cursor);
    const response = await this.client.request<unknown>(`/v2/calls?${query}`);
    const page = callsResponseSchema.parse(response.data);
    return {
      requestId: page.requestId ?? response.requestId,
      cursor: page.records?.cursor ?? null,
      calls: page.calls.map((call) => ({
        externalId: call.id,
        url: call.url,
        title: call.title,
        startedAt: new Date(call.started).toISOString(),
        durationSeconds: call.duration,
        primaryUserId: call.primaryUserId,
        language: call.language ?? null,
        participants: [],
        context: null,
        segments: [],
        providerRequestId: page.requestId ?? response.requestId,
      })),
    };
  }

  async getCall(input: { externalId: string; from: Date; to: Date }): Promise<NormalizedCall> {
    const filter = {
      fromDateTime: iso(input.from),
      toDateTime: iso(input.to),
      callIds: [input.externalId],
    };
    const extensiveCalls: Array<z.infer<typeof extensiveResponseSchema>["calls"][number]> = [];
    const transcriptCalls: Array<
      z.infer<typeof transcriptResponseSchema>["callTranscripts"][number]
    > = [];
    const requestIds: Array<string | null | undefined> = [];
    let extensiveCursor: string | undefined;
    do {
      const raw = await this.client.request<unknown>("/v2/calls/extensive", {
        method: "POST",
        body: JSON.stringify({
          ...(extensiveCursor ? { cursor: extensiveCursor } : {}),
          filter,
          contentSelector: {
            exposedFields: {
              parties: true,
              content: {
                brief: true,
                outline: true,
                highlights: true,
                callOutcome: true,
                keyPoints: true,
              },
            },
          },
        }),
      });
      const page = extensiveResponseSchema.parse(raw.data);
      extensiveCalls.push(...page.calls);
      requestIds.push(page.requestId, raw.requestId);
      extensiveCursor = page.records?.cursor;
    } while (extensiveCursor);
    let transcriptCursor: string | undefined;
    do {
      const raw = await this.client.request<unknown>("/v2/calls/transcript", {
        method: "POST",
        body: JSON.stringify({ ...(transcriptCursor ? { cursor: transcriptCursor } : {}), filter }),
      });
      const page = transcriptResponseSchema.parse(raw.data);
      transcriptCalls.push(...page.callTranscripts);
      requestIds.push(page.requestId, raw.requestId);
      transcriptCursor = page.records?.cursor;
    } while (transcriptCursor);
    const detail = extensiveCalls.find((item) => item.metaData.id === input.externalId);
    if (!detail) throw new GongError("Call not found in extensive response", "not_found", 30_000);
    const parties: Participant[] = (detail.parties ?? []).map((party) => ({
      externalId: party.id,
      speakerId: party.speakerId ?? null,
      name: party.name,
      email: party.emailAddress ?? null,
      title: party.title ?? null,
      affiliation: party.affiliation,
    }));
    const names = new Map(
      parties.filter((party) => party.speakerId).map((party) => [party.speakerId!, party.name]),
    );
    const transcript =
      transcriptCalls.find((item) => item.callId === input.externalId)?.transcript ?? [];
    const segments: TranscriptSegment[] = transcript.flatMap((monologue, monologueIndex) =>
      monologue.sentences.map((sentence, sentenceIndex) => ({
        id: `${input.externalId}:${monologueIndex}:${sentenceIndex}`,
        speakerId: monologue.speakerId,
        speakerName: names.get(monologue.speakerId) ?? "Unknown speaker",
        startMs: sentence.start,
        endMs: sentence.end,
        text: sentence.text,
        topic: monologue.topic ?? null,
      })),
    );
    const content = detail.content;
    const outcome =
      typeof content?.callOutcome === "string"
        ? content.callOutcome
        : (content?.callOutcome?.name ?? content?.callOutcome?.text ?? null);
    const context: GongContext | null = content
      ? {
          brief: content.brief ?? null,
          outline: content.outline ?? [],
          highlights: content.highlights ?? [],
          outcome,
          keyPoints: content.keyPoints ?? [],
        }
      : null;
    const meta = detail.metaData;
    return {
      externalId: meta.id,
      url: meta.url,
      title: meta.title,
      startedAt: new Date(meta.started).toISOString(),
      durationSeconds: meta.duration,
      primaryUserId: meta.primaryUserId,
      language: meta.language ?? null,
      participants: parties,
      context,
      segments,
      providerRequestId: requestIds.find((value): value is string => Boolean(value)) ?? null,
    };
  }
}
