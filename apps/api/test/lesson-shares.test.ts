import { env, SELF } from "cloudflare:test";
import { discussionResponseSchema, lessonShareExistsErrorSchema, lessonShareKey, postPageSchema, postResponseSchema, type Post } from "@wordinator/contracts";
import { courseDetailResponseSchema } from "@wordinator/contracts/lesson-document";
import { speechClipHash, speechItems } from "@wordinator/contracts/speech";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, publishLesson, readLesson, request, resetDatabase, saveDraft, seedGroup, seedUser, signIn,
} from "./courseApi";

beforeEach(resetDatabase);

// Share rows are written directly until the share endpoint exists (C11b); the lesson read only reports them.
async function insertShare(input: { groupId: string; authorId: string; courseId: string; lessonId: string; blockId: string; prompt?: string }) {
  const postId = crypto.randomUUID(); const now = Date.now();
  const question = input.prompt !== undefined;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO posts (id, group_id, author_id, type, body, notes, course_id, created_at, updated_at) VALUES (?, ?, ?, 'lesson_share', '', NULL, NULL, ?, ?)")
      .bind(postId, input.groupId, input.authorId, now, now),
    env.DB.prepare(`INSERT INTO post_lesson_shares (post_id, group_id, author_id, kind, course_id, lesson_id, block_id, item_index, share_key, snapshot, course_title, lesson_title, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Course', 'Lesson', ?)`)
      .bind(postId, input.groupId, input.authorId, question ? "question" : "dialogue", input.courseId, input.lessonId, input.blockId, question ? 0 : null,
        lessonShareKey({ blockId: input.blockId, prompt: input.prompt }), question ? "{}" : null, now),
  ]);
  return postId;
}

describe("Lesson reads report the viewer's shares", () => {
  it("maps only the viewer's share keys of that lesson to their posts, and forgets deleted posts", async () => {
    const ownerId = await seedUser("share-owner"); const readerId = await seedUser("share-reader");
    const groupId = await seedGroup("shares", ownerId); await join(groupId, readerId);
    const owner = await signIn("share-owner"); const reader = await signIn("share-reader");
    const course = await createCourse(groupId, owner);
    const dialogue = blocks.paragraph("Stand-in for a dialogue block"); const practice = blocks.paragraph("Stand-in for a practice block");
    const first = await addLesson(groupId, course.id, owner, "Mijn huis", { document: documentOf(dialogue, practice) });
    const second = await addLesson(groupId, course.id, owner, "De stad", { document: documentOf(blocks.paragraph("Elders")) });

    expect((await readLesson(first.path, reader)).myShares).toEqual({});
    const share = (authorId: string, lessonId: string, blockId: string, prompt?: string) =>
      insertShare({ groupId, authorId, courseId: course.id, lessonId, blockId, prompt });
    const dialoguePost = await share(readerId, first.lesson.id, dialogue.id);
    const questionPost = await share(readerId, first.lesson.id, practice.id, "Er … een balkon.");
    await share(ownerId, first.lesson.id, dialogue.id);
    const elsewhereBlock = crypto.randomUUID();
    const elsewhere = await share(readerId, second.lesson.id, elsewhereBlock);

    expect((await readLesson(first.path, reader)).myShares).toEqual({
      [dialogue.id]: dialoguePost, [lessonShareKey({ blockId: practice.id, prompt: "Er … een balkon." })]: questionPost,
    });
    expect(Object.values((await readLesson(first.path, owner)).myShares)).toHaveLength(1);
    expect((await readLesson(second.path, reader)).myShares).toEqual({ [elsewhereBlock]: elsewhere });

    // The course page's preloaded lessons carry the same map.
    const detail = courseDetailResponseSchema.parse(await (await request(coursePath(groupId, course.id), reader)).json());
    expect(detail.lessons.find((lesson) => lesson.id === first.lesson.id)?.myShares).toEqual({
      [dialogue.id]: dialoguePost, [lessonShareKey({ blockId: practice.id, prompt: "Er … een balkon." })]: questionPost,
    });

    await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(dialoguePost).run();
    expect(Object.keys((await readLesson(first.path, reader)).myShares)).toEqual([lessonShareKey({ blockId: practice.id, prompt: "Er … een balkon." })]);
  });
});

// Builders for the blocks the course API helpers do not cover.
const dialogueBlock = (turns: Array<{ speaker: string; text: string }>) => ({ id: crypto.randomUUID(), type: "dialogue" as const, props: { turns: JSON.stringify(turns) }, children: [] });
const richExample = () => ({
  id: crypto.randomUUID(), type: "example" as const, props: { translation: "There is a balcony.", note: "Er is, not het is." },
  content: [{ type: "text" as const, text: "Er is ", styles: {} }, { type: "text" as const, text: "een balkon", styles: { bold: true, textColor: "blue" as const } }], children: [],
});
const ITEM_NOTE = "Editor-only hint about the balcony";
const fillPractice = () => blocks.practice({
  instruction: "Vul in.", items: [
    { prompt: "Er … een balkon.", authorsVersion: ["is"], note: ITEM_NOTE },
    { prompt: "Waar is het station?", authorsVersion: ["Daar."] },
  ],
});
const passagePractice = () => blocks.practice({ instruction: "Lees.", passage: { title: null, content: "Een tekst." }, items: [{ prompt: "Waarover gaat het?" }] });
const insertReadyClip = async (hash: string) => {
  const now = Date.now();
  await env.DB.prepare("INSERT INTO speech_clips (hash, voice, characters, status, attempts, created_at, updated_at) VALUES (?, 'nl-NL-FennaNeural', 10, 'ready', 1, ?, ?)").bind(hash, now, now).run();
};

async function shareSetup(label: string) {
  const ownerId = await seedUser(`${label}-owner`); const readerId = await seedUser(`${label}-reader`);
  const groupId = await seedGroup(label, ownerId); await join(groupId, readerId);
  const owner = await signIn(`${label}-owner`); const reader = await signIn(`${label}-reader`);
  const course = await createCourse(groupId, owner);
  const share = (cookie: string, body: Record<string, unknown>) => request(`/api/groups/${groupId}/lesson-shares`, cookie, { courseId: course.id, ...body });
  const shared = async (cookie: string, body: Record<string, unknown>) => {
    const response = await share(cookie, body);
    expect(response.status, await response.clone().text()).toBe(201);
    return postResponseSchema.parse(await response.json()).post;
  };
  const readPost = async (postId: string, cookie = reader) => postResponseSchema.parse(await (await request(`/api/groups/${groupId}/posts/${postId}`, cookie)).json()).post;
  return { ownerId, readerId, groupId, owner, reader, course, share, shared, readPost };
}
const shareOf = <K extends NonNullable<Post["lessonShare"]>["kind"]>(post: Post, kind: K) => {
  expect(post.lessonShare?.kind).toBe(kind);
  return post.lessonShare as Extract<NonNullable<Post["lessonShare"]>, { kind: K }>;
};

describe("Sharing a piece of a lesson", () => {
  it("refuses signed-out and unfinished accounts", async () => {
    const { groupId, course } = await shareSetup("guard");
    const body = { courseId: course.id, lessonId: crypto.randomUUID(), blockId: crypto.randomUUID() };
    const anonymous = await SELF.fetch(`https://wordinator.test/api/groups/${groupId}/lesson-shares`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    expect(anonymous.status).toBe(401);
    const newcomerId = await seedUser("guard-newcomer"); await join(groupId, newcomerId);
    await env.DB.prepare("UPDATE users SET display_name = 'New learner' WHERE id = ?").bind(newcomerId).run();
    const newcomer = await request(`/api/groups/${groupId}/lesson-shares`, await signIn("guard-newcomer"), body);
    expect(newcomer.status).toBe(403);
    expect(await errorCode(newcomer)).toBe("ONBOARDING_REQUIRED");
  });

  it("snapshots an example with its formatting, note, and ready clip, and ignores client-sent content", async () => {
    const { groupId, owner, reader, course, share, shared, readPost } = await shareSetup("example");
    await addLesson(groupId, course.id, owner, "Intro");
    const example = richExample(); const silent = blocks.example("Zonder klank.");
    const { lesson } = await addLesson(groupId, course.id, owner, "Mijn huis", { document: documentOf(example, silent) });
    const [item] = speechItems(documentOf(example), null, "nl");
    await insertReadyClip(await speechClipHash(item!));

    expect(await errorCode(await share(reader, { lessonId: lesson.id, blockId: example.id, snapshot: { content: [] } }))).toBe("VALIDATION_ERROR");
    const post = await shared(reader, { lessonId: lesson.id, blockId: example.id, note: "  Mooi voorbeeld  " });
    expect(post).toMatchObject({ type: "lesson_share", body: "", notes: "Mooi voorbeeld", permissions: { edit: true, delete: true } });
    const shareView = shareOf(post, "example");
    expect(shareView.example).toEqual({ content: example.content, translation: "There is a balcony.", note: "Er is, not het is." });
    expect(shareView.speechUrl).toMatch(/^https:\/\/wordinator\.test\/api\/media\/speech\/[0-9a-f]{64}\.mp3$/);
    expect(shareView.source).toMatchObject({ courseId: course.id, lessonId: lesson.id, blockId: example.id, linked: true, courseTitle: "Dutch foundations", lessonTitle: "Mijn huis", lessonNumber: 2, lessonSlug: "mijn-huis" });
    expect(shareOf(await shared(reader, { lessonId: lesson.id, blockId: silent.id }), "example").speechUrl).toBeNull();
    expect(shareOf(await readPost(post.id), "example").example.content).toEqual(example.content);
  });

  it("snapshots one question without its item note and keys it by prompt", async () => {
    const { groupId, owner, reader, readerId, course, share, shared, readPost } = await shareSetup("question");
    const practice = fillPractice();
    const { lesson, path } = await addLesson(groupId, course.id, owner, "Mijn huis", { document: documentOf(practice) });
    const post = await shared(reader, { lessonId: lesson.id, blockId: practice.id, itemIndex: 0 });
    expect(shareOf(post, "question").question).toEqual({ instruction: "Vul in.", prompt: "Er … een balkon.", authorsVersion: ["is"], itemIndex: 0 });
    expect(JSON.stringify(await (await request(`/api/groups/${groupId}/posts/${post.id}`, reader)).json())).not.toContain(ITEM_NOTE);
    const stored = await env.DB.prepare("SELECT snapshot FROM post_lesson_shares WHERE post_id = ?").bind(post.id).first<{ snapshot: string }>();
    expect(stored!.snapshot).not.toContain(ITEM_NOTE);
    expect((await readLesson(path, reader)).myShares).toEqual({ [lessonShareKey({ blockId: practice.id, prompt: "Er … een balkon." })]: post.id });

    // A second share of the same question is refused with the post, even after the author reorders the items.
    const repeated = await share(reader, { lessonId: lesson.id, blockId: practice.id, itemIndex: 0 });
    expect(repeated.status).toBe(409);
    expect(lessonShareExistsErrorSchema.parse(await repeated.json()).postId).toBe(post.id);
    const reordered = { ...practice, props: { data: JSON.stringify({ instruction: "Vul in.", items: [{ prompt: "Waar is het station?" }, { prompt: "Er … een balkon.", authorsVersion: ["is"] }] }) } };
    const draft = await saveDraft(path, owner, documentOf(reordered), (await readLesson(path, owner)).draft!.version);
    await publishLesson(path, owner, draft.draftVersion);
    const moved = await share(reader, { lessonId: lesson.id, blockId: practice.id, itemIndex: 1 });
    expect(moved.status).toBe(409);
    expect(lessonShareExistsErrorSchema.parse(await moved.json()).postId).toBe(post.id);
    // The snapshot keeps the question as it was shared.
    expect(shareOf(await readPost(post.id), "question").question.itemIndex).toBe(0);
    // Another person may share it, and the sharer may share it again once the post is deleted.
    await shared(owner, { lessonId: lesson.id, blockId: practice.id, itemIndex: 1 });
    expect((await request(`/api/groups/${groupId}/posts/${post.id}`, reader, undefined, "DELETE")).status).toBe(200);
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM post_lesson_shares WHERE author_id = ?").bind(readerId).first("total")).toBe(0);
    const again = await shared(reader, { lessonId: lesson.id, blockId: practice.id, itemIndex: 1 });
    expect(shareOf(again, "question").question.itemIndex).toBe(1);
  });

  it("refuses pieces that cannot be shared and lessons or courses the sharer cannot share from", async () => {
    const { groupId, owner, reader, course, share } = await shareSetup("refusals");
    const example = blocks.example("Gepubliceerd."); const paragraph = blocks.paragraph("Tekst."); const practice = fillPractice(); const passage = passagePractice();
    const dialogue = dialogueBlock([{ speaker: "Anna", text: "Hoi!" }]);
    const { lesson, path } = await addLesson(groupId, course.id, owner, "Les", { document: documentOf(example, paragraph, practice, passage, dialogue) });
    const draftOnly = blocks.example("Alleen in het concept.");
    await saveDraft(path, owner, documentOf(example, paragraph, practice, passage, dialogue, draftOnly), (await readLesson(path, owner)).draft!.version);
    const code = async (cookie: string, body: Record<string, unknown>) => errorCode(await share(cookie, { lessonId: lesson.id, ...body }));

    for (const body of [
      { blockId: draftOnly.id }, { blockId: crypto.randomUUID() }, { blockId: paragraph.id }, { blockId: practice.id },
      { blockId: practice.id, itemIndex: 2 }, { blockId: passage.id, itemIndex: 0 }, { blockId: example.id, itemIndex: 0 }, { blockId: dialogue.id, itemIndex: 0 },
    ]) expect(await code(reader, body), JSON.stringify(body)).toBe("LESSON_SHARE_NOT_SHAREABLE");
    expect((await share(reader, { lessonId: lesson.id, blockId: paragraph.id })).status).toBe(422);
    // Draft previews offer nothing to share, even to editors.
    expect(await code(owner, { blockId: draftOnly.id })).toBe("LESSON_SHARE_NOT_SHAREABLE");

    const hidden = await addLesson(groupId, course.id, owner, "Verborgen", { published: false, document: documentOf(blocks.example("Nog niet.")) });
    const hiddenBlock = hidden.lesson.draft!.document.blocks[0]!.id;
    expect(await code(reader, { lessonId: hidden.lesson.id, blockId: hiddenBlock })).toBe("LESSON_NOT_FOUND");
    expect(await code(owner, { lessonId: hidden.lesson.id, blockId: hiddenBlock })).toBe("LESSON_UNPUBLISHED");

    const other = await createCourse(groupId, owner, true, { title: "Other course", summary: "Elsewhere." });
    expect(await errorCode(await request(`/api/groups/${groupId}/lesson-shares`, reader, { courseId: other.id, lessonId: lesson.id, blockId: example.id }))).toBe("LESSON_NOT_FOUND");
    const draftCourse = await createCourse(groupId, owner, false, { title: "Draft course", summary: "Not yet." });
    expect(await errorCode(await request(`/api/groups/${groupId}/lesson-shares`, reader, { courseId: draftCourse.id, lessonId: lesson.id, blockId: example.id }))).toBe("COURSE_NOT_FOUND");

    expect((await request(`${coursePath(groupId, course.id)}/archive`, owner, {})).status).toBe(200);
    expect(await code(reader, { blockId: example.id })).toBe("COURSE_NOT_FOUND");
    expect(await code(owner, { blockId: example.id })).toBe("COURSE_ARCHIVED");
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM posts WHERE type = 'lesson_share'").first("total")).toBe(0);
  });

  it("follows a shared dialogue's lesson while snapshots outlive it", async () => {
    const { groupId, owner, reader, course, shared, readPost } = await shareSetup("dialogue");
    const turns = [{ speaker: "Anna", text: "Hoi!" }, { speaker: "Ben", text: "Dag." }];
    const dialogue = dialogueBlock(turns); const example = blocks.example("Blijft staan."); const practice = fillPractice();
    const full = documentOf(dialogue, example, practice);
    const { lesson, path } = await addLesson(groupId, course.id, owner, "Gesprek", { document: full });
    const [firstTurn] = speechItems(documentOf(dialogue), null, "nl");
    await insertReadyClip(await speechClipHash(firstTurn!));

    const dialoguePost = await shared(reader, { lessonId: lesson.id, blockId: dialogue.id });
    const examplePost = await shared(reader, { lessonId: lesson.id, blockId: example.id });
    const questionPost = await shared(reader, { lessonId: lesson.id, blockId: practice.id, itemIndex: 1 });
    expect(shareOf(dialoguePost, "dialogue")).toMatchObject({ available: true, turns, source: { linked: true, lessonNumber: 1 } });
    expect(Object.keys(shareOf(dialoguePost, "dialogue").speech)).toEqual([firstTurn!.key]);

    const dialogueState = async () => {
      const view = shareOf(await readPost(dialoguePost.id), "dialogue");
      return { available: view.available, turns: view.turns, linked: view.source.linked };
    };
    const snapshotsIntact = async () => {
      expect(shareOf(await readPost(examplePost.id), "example").example.content).toEqual(example.content);
      expect(shareOf(await readPost(questionPost.id), "question").question.prompt).toBe("Waar is het station?");
    };
    const republish = async (document: ReturnType<typeof documentOf>) => {
      const saved = await saveDraft(path, owner, document, (await readLesson(path, owner)).draft!.version);
      await publishLesson(path, owner, saved.draftVersion);
    };

    // Author edits show up; removing the block hides it until it comes back.
    const edited = [{ speaker: "Anna", text: "Hallo!" }];
    await republish(documentOf({ ...dialogue, props: { turns: JSON.stringify(edited) } }, example, practice));
    expect(await dialogueState()).toEqual({ available: true, turns: edited, linked: true });
    await republish(documentOf(example, practice));
    expect(await dialogueState()).toEqual({ available: false, turns: null, linked: true });
    await snapshotsIntact();
    await republish(full);
    expect(await dialogueState()).toEqual({ available: true, turns, linked: true });

    expect((await request(`${path}/unpublish`, owner, {})).status).toBe(200);
    expect(await dialogueState()).toEqual({ available: false, turns: null, linked: false });
    await snapshotsIntact();
    await publishLesson(path, owner, (await readLesson(path, owner)).draft!.version);
    expect(await dialogueState()).toEqual({ available: true, turns, linked: true });

    expect((await request(`${coursePath(groupId, course.id)}/archive`, owner, {})).status).toBe(200);
    expect(await dialogueState()).toEqual({ available: false, turns: null, linked: false });
    expect(shareOf(await readPost(dialoguePost.id, owner), "dialogue").available).toBe(false);
    await snapshotsIntact();
    // A restored course returns as a draft: its owner sees the dialogue again, and everyone once it is published.
    expect((await request(`${coursePath(groupId, course.id)}/restore`, owner, {})).status).toBe(200);
    expect(await dialogueState()).toEqual({ available: false, turns: null, linked: false });
    expect(shareOf(await readPost(dialoguePost.id, owner), "dialogue").available).toBe(true);
    expect((await request(`${coursePath(groupId, course.id)}/visibility`, owner, { status: "published" })).status).toBe(200);
    expect(await dialogueState()).toEqual({ available: true, turns, linked: true });

    // Renames show live while the lesson is visible, and the saved titles once it is gone.
    expect((await request(path, owner, { title: "Nieuw gesprek", goal: null }, "PATCH")).status).toBe(200);
    expect(shareOf(await readPost(examplePost.id), "example").source.lessonTitle).toBe("Nieuw gesprek");
    expect((await request(path, owner, undefined, "DELETE")).status).toBe(200);
    expect(await dialogueState()).toEqual({ available: false, turns: null, linked: false });
    await snapshotsIntact();
    expect(shareOf(await readPost(examplePost.id), "example").source).toEqual({
      courseId: course.id, lessonId: null, blockId: example.id, linked: false, courseTitle: "Dutch foundations", lessonTitle: "Gesprek",
      lessonNumber: null, courseSlug: null, lessonSlug: null,
    });
  });

  it("serves shares in the feed and profile, edits only the note, and keeps comments visible and unpinnable", async () => {
    const { groupId, owner, reader, readerId, course, shared, readPost } = await shareSetup("journal");
    const example = blocks.example("In de feed."); const dialogue = dialogueBlock([{ speaker: "Anna", text: "Hoi!" }]);
    const { lesson } = await addLesson(groupId, course.id, owner, "Les", { document: documentOf(example, dialogue) });
    const post = await shared(reader, { lessonId: lesson.id, blockId: example.id, note: "Eerste" });
    await shared(reader, { lessonId: lesson.id, blockId: dialogue.id });

    const feed = postPageSchema.parse(await (await request(`/api/groups/${groupId}/posts`, owner)).json());
    expect(feed.items.filter((item) => item.type === "lesson_share").map((item) => item.lessonShare?.kind)).toEqual(["dialogue", "example"]);
    expect(feed.items.find((item) => item.type === "course")?.lessonShare).toBeNull();
    const profile = await (await request(`/api/groups/${groupId}/members/${readerId}`, owner)).json() as { posts: unknown };
    expect(postPageSchema.parse(profile.posts).items.map((item) => item.lessonShare?.kind)).toEqual(["dialogue", "example"]);

    const postPath = `/api/groups/${groupId}/posts/${post.id}`;
    const renote = await request(postPath, reader, { type: "lesson_share", notes: " Bijgewerkt " }, "PATCH");
    expect(renote.status).toBe(200);
    const renoted = postResponseSchema.parse(await renote.json()).post;
    expect(renoted).toMatchObject({ notes: "Bijgewerkt", type: "lesson_share", edited: true });
    expect(renoted.lessonShare).toEqual(post.lessonShare);
    expect(await errorCode(await request(postPath, reader, { type: "shared_sentence", body: "Iets anders" }, "PATCH"))).toBe("POST_NOT_EDITABLE");
    expect(await errorCode(await request(postPath, reader, { type: "lesson_share", notes: null, body: "Iets anders" }, "PATCH"))).toBe("VALIDATION_ERROR");
    expect(await errorCode(await request(postPath, owner, { type: "lesson_share", notes: null }, "PATCH"))).toBe("POST_EDIT_FORBIDDEN");
    expect((await readPost(post.id)).body).toBe("");
    // No ordinary post becomes a share.
    const ordinary = postResponseSchema.parse(await (await request(`/api/groups/${groupId}/posts`, reader, { type: "shared_sentence", body: "Hallo", notes: null })).json()).post;
    expect(await errorCode(await request(`/api/groups/${groupId}/posts/${ordinary.id}`, reader, { type: "lesson_share", notes: null }, "PATCH"))).toBe("VALIDATION_ERROR");

    const comment = await request(`${postPath}/comments`, owner, { kind: "text", body: "Leuk!" });
    expect(comment.status).toBe(201);
    const discussion = discussionResponseSchema.parse(await (await request(`${postPath}/discussion`, reader)).json());
    expect(discussion).toMatchObject({ concealed: false, count: 1 });
    expect(await errorCode(await request(`${postPath}/pin`, reader, { commentId: discussion.items[0]!.id }, "PUT"))).toBe("PIN_UNAVAILABLE");
    // Sharing notifies no one; the comment notifies the sharer like any post.
    const kinds = await env.DB.prepare("SELECT kind FROM notifications WHERE post_id = ?").bind(post.id).all<{ kind: string }>();
    expect(kinds.results.map((row) => row.kind)).toEqual(["post_response"]);
  });
});
