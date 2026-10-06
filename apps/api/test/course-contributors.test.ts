import { env } from "cloudflare:test";
import { courseContributorsResponseSchema, coursePageSchema, courseResponseSchema, notificationPageSchema } from "@wordinator/contracts";
import { courseDetailResponseSchema, lessonResponseSchema } from "@wordinator/contracts/lesson-document";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addLesson as createLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, readLesson, request, resetDatabase, saveDraft, seedGroup, seedUser, signIn,
} from "./courseApi";

const addLesson = async (groupId: string, courseId: string, cookie: string, title: string, published: boolean) =>
  (await createLesson(groupId, courseId, cookie, title, { published })).lesson;

const contributors = async (groupId: string, courseId: string, cookie: string) =>
  courseContributorsResponseSchema.parse(await (await request(`${coursePath(groupId, courseId)}/contributors`, cookie)).json());
const notifications = async (groupId: string, cookie: string) =>
  notificationPageSchema.parse(await (await request(`/api/groups/${groupId}/notifications`, cookie)).json()).items;

// Owner, contributor, and an ordinary member in one group, with a published course whose contributor has been accepted.
async function setup() {
  const ownerId = await seedUser("owner"); const helperId = await seedUser("helper"); const readerId = await seedUser("reader");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, helperId); await join(groupId, readerId);
  const owner = await signIn("owner"); const helper = await signIn("helper"); const reader = await signIn("reader");
  const course = await createCourse(groupId, owner);
  const path = coursePath(groupId, course.id);
  return { ownerId, helperId, readerId, groupId, owner, helper, reader, course, path };
}

async function accept(path: string, owner: string, helper: string, helperId: string) {
  expect((await request(`${path}/contributors`, helper, {})).status).toBe(201);
  expect((await request(`${path}/contributors/${helperId}`, owner, { decision: "accept" }, "PATCH")).status).toBe(200);
}

beforeEach(resetDatabase);

describe("Course contributors API", () => {
  it("runs the request, decision, and notification lifecycle", async () => {
    const { ownerId, helperId, groupId, owner, helper, reader, path } = await setup();
    const requested = await request(`${path}/contributors`, helper, {});
    expect(requested.status).toBe(201);
    const pending = courseResponseSchema.parse(await requested.json()).course;
    expect(pending.contribution).toBe("pending");
    expect(pending.permissions).toMatchObject({ contribute: false, requestContribution: false, leaveContribution: true });
    expect((await request(`${path}/contributors`, helper, {})).status).toBe(409);
    expect((await request(`${path}/contributors`, owner, {})).status).toBe(400);

    const [notice] = await notifications(groupId, owner);
    expect(notice).toMatchObject({ kind: "contributor_requested", actor: { id: helperId }, courseId: pending.id, postId: null, targetAvailable: true });
    expect((await contributors(groupId, pending.id, owner)).pending.map((entry) => entry.user.id)).toEqual([helperId]);
    expect((await contributors(groupId, pending.id, reader)).pending).toEqual([]);

    expect((await request(`${path}/contributors/${helperId}`, owner, { decision: "accept" }, "PATCH")).status).toBe(200);
    expect((await request(`${path}/contributors/${helperId}`, owner, { decision: "accept" }, "PATCH")).status).toBe(404);
    expect((await notifications(groupId, helper))[0]).toMatchObject({ kind: "contributor_accepted", actor: { id: ownerId }, courseId: pending.id });
    const listed = await contributors(groupId, pending.id, reader);
    expect(listed.active.map((entry) => entry.user.id)).toEqual([helperId]);
    const active = courseResponseSchema.parse(await (await request(path, helper)).json()).course;
    expect(active).toMatchObject({ contribution: "active", permissions: { contribute: true, edit: false, publish: false, manageContributors: false } });
  });

  it("lets rejected, departed, and removed contributors ask again", async () => {
    const { helperId, groupId, owner, helper, path, course } = await setup();
    await request(`${path}/contributors`, helper, {});
    expect((await request(`${path}/contributors/${helperId}`, owner, { decision: "reject" }, "PATCH")).status).toBe(200);
    expect((await notifications(groupId, helper))[0]).toMatchObject({ kind: "contributor_rejected" });
    await accept(path, owner, helper, helperId);
    expect((await request(`${path}/contributors/leave`, helper, {})).status).toBe(200);
    expect((await request(`${path}/contributors/leave`, helper, {})).status).toBe(404);
    await accept(path, owner, helper, helperId);
    expect((await request(`${path}/contributors/${helperId}`, owner, undefined, "DELETE")).status).toBe(200);
    expect((await request(`${path}/contributors/${helperId}`, owner, undefined, "DELETE")).status).toBe(404);
    expect((await request(`${path}/contributors`, helper, {})).status).toBe(201);
    // A pending request can be withdrawn.
    expect((await request(`${path}/contributors/leave`, helper, {})).status).toBe(200);
    expect((await contributors(groupId, course.id, owner)).pending).toEqual([]);
  });

  it("lets contributors edit every lesson draft and keeps publishing and published details with the owner", async () => {
    const { helperId, owner, helper, reader, path, groupId, course } = await setup();
    const published = await addLesson(groupId, course.id, owner, "Owner lesson", true);
    await accept(path, owner, helper, helperId);

    const draft = lessonResponseSchema.parse(await (await request(`${path}/lessons`, helper, { title: "Helper lesson", goal: null })).json()).lesson;
    expect(draft).toMatchObject({ published: false, updatedBy: { id: helperId }, draft: { version: 1 } });
    const renamed = await request(`${path}/lessons/${draft.id}`, helper, { title: "Helper lesson, revised", goal: null }, "PATCH");
    expect(renamed.status).toBe(200);
    expect(await errorCode(await request(`${path}/lessons/${published.id}`, helper, { title: "Hijacked", goal: null }, "PATCH"))).toBe("COURSE_CONTENT_PUBLISHED");

    // Contributors autosave drafts of published lessons too; readers keep seeing the published document.
    const proposal = documentOf(blocks.paragraph("Helper note"));
    const saved = await saveDraft(`${path}/lessons/${published.id}`, helper, proposal, published.draft!.version);
    expect(saved).toMatchObject({ changed: true, updatedBy: { id: helperId } });
    expect((await readLesson(`${path}/lessons/${published.id}`, reader)).document!.blocks).toEqual([]);
    for (const action of ["publish", "discard", "unpublish"]) {
      const refused = await request(`${path}/lessons/${published.id}/${action}`, helper, { draftVersion: saved.draftVersion });
      expect(refused.status).toBe(403);
      expect(await errorCode(refused)).toBe("COURSE_PUBLISH_FORBIDDEN");
    }
    expect(await errorCode(await request(`${path}/lessons/${draft.id}/publish`, helper, { draftVersion: 1 }))).toBe("COURSE_PUBLISH_FORBIDDEN");
    const approved = lessonResponseSchema.parse(await (await request(`${path}/lessons/${published.id}/publish`, owner, { draftVersion: saved.draftVersion })).json()).lesson;
    expect(approved).toMatchObject({ document: proposal, changed: false });

    // Course details, visibility, reordering, contributor decisions, and deletion stay with the owner.
    expect((await request(path, helper, { title: "Renamed", summary: "No" }, "PATCH")).status).toBe(403);
    expect((await request(`${path}/visibility`, helper, { status: "draft" })).status).toBe(403);
    expect((await request(`${path}/lessons/order`, helper, { ids: [draft.id, published.id] }, "PUT")).status).toBe(403);
    expect((await request(`${path}/lessons/${draft.id}`, helper, undefined, "DELETE")).status).toBe(403);
    expect((await request(`${path}/contributors/${helperId}`, helper, undefined, "DELETE")).status).toBe(403);
  });

  it("shows drafts to active contributors only", async () => {
    const { helperId, owner, helper, reader, path, groupId, course } = await setup();
    await accept(path, owner, helper, helperId);
    const draft = await addLesson(groupId, course.id, helper, "Unpublished", false);
    await request(`${path}/visibility`, owner, { status: "draft" });
    const library = coursePageSchema.parse(await (await request(`/api/groups/${groupId}/courses`, helper)).json());
    expect(library.items.map((item) => item.id)).toEqual([course.id]);
    expect(courseDetailResponseSchema.parse(await (await request(path, helper)).json()).outline.map((entry) => entry.id)).toEqual([draft.id]);
    expect((await request(path, reader)).status).toBe(404);
    expect((await request(`${path}/contributors`, reader, {})).status).toBe(404);
  });

  it("refuses edits from non-contributors, pending requesters, and former contributors", async () => {
    const { helperId, owner, helper, reader, path, groupId, course } = await setup();
    const draft = await addLesson(groupId, course.id, owner, "Owner draft", false);
    const published = await addLesson(groupId, course.id, owner, "Owner lesson", true);
    expect((await request(`${path}/lessons`, reader, { title: "Intruder", goal: null })).status).toBe(403);
    expect((await request(`${path}/lessons/${published.id}/draft`, reader, { document: documentOf(), draftVersion: published.draft!.version }, "PUT")).status).toBe(403);
    expect((await readLesson(`${path}/lessons/${published.id}`, reader)).draft).toBeNull();
    expect((await request(`${path}/lessons/${draft.id}`, reader, { title: "x", goal: null }, "PATCH")).status).toBe(403);

    await request(`${path}/contributors`, helper, {});
    expect((await request(`${path}/lessons`, helper, { title: "Too early", goal: null })).status).toBe(403);

    await request(`${path}/contributors/${helperId}`, owner, { decision: "accept" }, "PATCH");
    expect((await request(`${path}/lessons/${draft.id}`, helper)).status).toBe(200);
    await request(`${path}/contributors/leave`, helper, {});
    expect((await request(`${path}/lessons`, helper, { title: "Former", goal: null })).status).toBe(403);
    expect((await request(`${path}/lessons/${draft.id}`, helper)).status).toBe(404);

    await accept(path, owner, helper, helperId);
    await request(`${path}/contributors/${helperId}`, owner, undefined, "DELETE");
    expect((await request(`${path}/lessons/${published.id}/draft`, helper, { document: documentOf(), draftVersion: published.draft!.version }, "PUT")).status).toBe(403);
    expect((await readLesson(`${path}/lessons/${published.id}`, helper)).draft).toBeNull();
    // Departure keeps authored content attributed to the former contributor.
    expect((await request(`${path}/lessons/${published.id}`, owner)).status).toBe(200);
  });

  it("ends contributor roles when a member leaves the group and refuses to accept non-members", async () => {
    const { helperId, readerId, owner, helper, reader, path, groupId } = await setup();
    await accept(path, owner, helper, helperId);
    expect((await request(`/api/groups/${groupId}/memberships/leave`, helper, { confirmation: true })).status).toBe(200);
    await env.DB.prepare("UPDATE memberships SET state = 'active' WHERE group_id = ? AND user_id = ?").bind(groupId, helperId).run();
    const rejoined = courseResponseSchema.parse(await (await request(path, helper)).json()).course;
    expect(rejoined.contribution).toBeNull();

    await request(`${path}/contributors`, reader, {});
    await env.DB.prepare("UPDATE memberships SET state = 'left' WHERE group_id = ? AND user_id = ?").bind(groupId, readerId).run();
    expect((await request(`${path}/contributors/${readerId}`, owner, { decision: "accept" }, "PATCH")).status).toBe(404);
  });

  it("keeps contributor routes inside their group and away from the group creator", async () => {
    const { helperId, readerId, groupId, owner, helper, reader, path, course } = await setup();
    const outsiderId = await seedUser("outsider"); const otherGroup = await seedGroup("beta", outsiderId); const outsider = await signIn("outsider");
    const foreign = await createCourse(otherGroup, outsider);
    expect((await request(`${path}/contributors`, outsider, {})).status).toBe(404);
    expect((await request(`${path}/contributors`, outsider)).status).toBe(404);
    expect((await request(`${coursePath(groupId, foreign.id)}/contributors`, helper, {})).status).toBe(404);
    expect((await request(`${coursePath(groupId, foreign.id)}/contributors/leave`, helper, {})).status).toBe(404);

    await request(`${path}/contributors`, helper, {});
    expect((await request(`${coursePath(otherGroup, course.id)}/contributors/${helperId}`, outsider, { decision: "accept" }, "PATCH")).status).toBe(404);

    // The group creator moderates content but does not decide contributors for another member's course.
    const helperCourse = coursePath(groupId, (await createCourse(groupId, helper)).id);
    expect((await request(`${helperCourse}/contributors`, reader, {})).status).toBe(201);
    expect((await request(`${helperCourse}/contributors/${readerId}`, owner, { decision: "accept" }, "PATCH")).status).toBe(403);
    expect((await request(`${path}/contributors/${helperId}`, helper, { decision: "accept" }, "PATCH")).status).toBe(403);
  });

  it("marks contributor notifications unavailable once the course is archived", async () => {
    const { helperId, groupId, owner, helper, path } = await setup();
    await accept(path, owner, helper, helperId);
    await request(`${path}/archive`, owner, {});
    expect((await notifications(groupId, helper))[0]).toMatchObject({ kind: "contributor_accepted", targetAvailable: false });
    expect((await request(`${path}/contributors`, helper, {})).status).toBe(404);
  });
});
