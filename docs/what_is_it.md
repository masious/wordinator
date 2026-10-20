# What is Wordinator?

Wordinator is a self-hosted practice space for people who are already committed to learning Dutch or German. They know which skill they want to work on—grammar, vocabulary, listening, speaking, reading—and where they are weak. Wordinator lets them go straight to that practice, shows them how far they have come, and uses the interface to guide them to what to do next.

The working title **Wordinator** may change.

## Who it is for

The target learner:

- is learning **Dutch** (the primary language) or **German**;
- is already committed: they study regularly and do not need to be persuaded or entertained, though a personal daily goal and streak help them keep the habit;
- knows what they want to practice and expects the app to get out of the way and let them do it;
- practices at a **desktop** computer with a keyboard and a large screen.

Wordinator is not a public network, professional course provider, tutoring marketplace, or native-speaker matching service. Registration is open and immediate (see [authentication](authentication.md)); the community is small and the content is member-authored.

### Desktop first

Committed learners study mainly on desktop, so desktop is the primary composition for new work. Phones remain supported: every UI decision specifies a phone equivalent that ships with it (owner decision, 2026-10-16, replacing the earlier plan to discontinue phone support). The [AI tutor](ai-tutor.md) (C14) works the same on phones and desktops. See [product requirements](product-requirements.md#release-definition).

## What learners do

1. Choose the skill they want to practice and open a course or lesson aimed at it in the global [course library](courses.md).
2. Work through lessons: restricted rich text, practice blocks, new words, and synthesized [lesson speech](speech.md) for listening.
3. Collect and review words in the Words tab (see [words](words.md)).
4. Track progress: lesson and practice progress show what is finished and what comes next.
5. Optionally share sentences, questions, and exercises with other learners in the [journal](posts-and-feed.md).
6. Study with an [AI tutor](ai-tutor.md) (planned, C14) that knows their lessons, weak words, and mistakes, teaches the next lesson, and asks practice questions in the chat.

Content comes from members; the platform does not ship a fixed curriculum. The member-authored Dutch Foundations content is described in [content](content/index.md).

## Product character

Wordinator should feel like a calm, focused study desk: modern, warm, tactile, and personal (see [design system](design-system.md)). Because learners are already motivated, the product favors directness over persuasion: the shortest path to the chosen practice, clear progress, and guidance toward the next useful step. Measuring progress and guiding learners through the interface are in scope. Personal [learning time](learning-time.md), a daily goal the learner sets, and a streak of days that met it are in scope (C15). Points, rankings, leaderboards, rewards, and attention-maximizing mechanics are not: progress is personal and non-competitive. Typical lesson times built from every learner's time are shown as medians, never as anyone's own figure.

## Why build it

General courses and apps decide what the learner practices next and pad sessions with motivation mechanics. Committed learners who already know their weak spots need a place where they pick the skill, practice it directly, and see their progress—with material written by people learning the same language.

## Business context

This is a private, non-commercial project. There is no current plan for monetization, a hosted service, or open-source distribution. Success means usefulness: committed learners return to it for the practice they choose and prefer it to scattered books, sites, and chats.

The expected load is small, so clarity and maintainability matter more than distributed-system scale.

## Explicit non-goals

- Mobile phone layouts or phone-specific features for new work
- Public discovery, public profiles, followers, or direct messages
- Platform-provided lessons or a fixed curriculum, translation, or dictionaries. Two former non-goals have narrowed: pronunciation assessment exists on [spoken answers](words.md#pronunciation-assessment) (C13), and since C14 its scores are stored privately; the [AI tutor](ai-tutor.md) judges open answers and points out mistakes in its own chat. Neither grades or corrects journal posts or comments.
- Scores shown as numbers or percentages of a learner's knowledge. Learning data is stored (C14) to guide the learner and the tutor; the only visible signs of weakness are the Weak words view's dots and lesson states.
- Gamification: points, rankings, leaderboards, or rewards. A personal streak against the learner's own daily goal is the one exception ([learning time](learning-time.md#daily-goal-and-streak)).
- Automated language detection or enforcement
- Rich text, media posts, audio, or file attachments outside course lessons. Course lessons are a deliberate exception for restricted rich text and images, owned by [courses](courses.md#lesson-documents), and for synthesized [lesson speech](speech.md). The [AI tutor's](ai-tutor.md#messages-and-formatting) assistant messages (C14) are a second exception, with a small Markdown subset and on-demand audio.
- Monetization or advertising
