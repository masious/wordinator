import {
  type SessionResponse,
  PostType
} from "@wordinator/contracts";

export type SignedInSession = Extract<SessionResponse, { status: "signedIn" }>;
export type TypeDraft = {
  body: string;
  notes: string;
  questions: string[];
  expectedAnswers: Array<string | null>;
};

export type ComposerDraft = {
  version: 1;
  activeType: PostType;
  byType: Record<PostType, TypeDraft>;
};
