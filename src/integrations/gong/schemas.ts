import { z } from "zod";

export const recordsSchema = z.object({ cursor: z.string().optional() }).passthrough();
export const callBasicSchema = z
  .object({
    id: z.string(),
    url: z.string().url(),
    title: z.string(),
    started: z.string(),
    duration: z.number().int(),
    primaryUserId: z.string(),
    language: z.string().optional(),
  })
  .passthrough();
export const callsResponseSchema = z
  .object({
    requestId: z.string().optional(),
    records: recordsSchema.optional(),
    calls: z.array(callBasicSchema),
  })
  .passthrough();

export const partySchema = z
  .object({
    id: z.string(),
    speakerId: z.string().optional(),
    name: z.string().optional().default("Unknown participant"),
    emailAddress: z.string().email().optional(),
    title: z.string().optional(),
    affiliation: z.enum(["Internal", "External", "Unknown"]).default("Unknown"),
  })
  .passthrough();
const stringish = z
  .union([z.string(), z.object({ text: z.string() }).passthrough()])
  .transform((item) => (typeof item === "string" ? item : item.text));
export const contentSchema = z
  .object({
    brief: z.string().optional(),
    outline: z.array(stringish).optional(),
    highlights: z.array(stringish).optional(),
    callOutcome: z
      .union([
        z.string(),
        z.object({ name: z.string().optional(), text: z.string().optional() }).passthrough(),
      ])
      .optional(),
    keyPoints: z.array(stringish).optional(),
  })
  .passthrough();
export const extensiveResponseSchema = z
  .object({
    requestId: z.string().optional(),
    records: recordsSchema.optional(),
    calls: z.array(
      z
        .object({
          metaData: callBasicSchema,
          parties: z.array(partySchema).optional(),
          content: contentSchema.optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const sentenceSchema = z
  .object({ start: z.number().int(), end: z.number().int(), text: z.string() })
  .passthrough();
export const monologueSchema = z
  .object({
    speakerId: z.string(),
    topic: z.string().optional(),
    sentences: z.array(sentenceSchema),
  })
  .passthrough();
export const transcriptResponseSchema = z
  .object({
    requestId: z.string().optional(),
    records: recordsSchema.optional(),
    callTranscripts: z.array(
      z.object({ callId: z.string(), transcript: z.array(monologueSchema) }).passthrough(),
    ),
  })
  .passthrough();
export const usersResponseSchema = z
  .object({
    users: z.array(
      z
        .object({
          id: z.string(),
          emailAddress: z.string().email(),
          firstName: z.string().default(""),
          lastName: z.string().default(""),
          active: z.boolean().default(true),
        })
        .passthrough(),
    ),
    records: recordsSchema.optional(),
  })
  .passthrough();
