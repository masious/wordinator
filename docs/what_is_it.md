# What is Wordinator?

Wordinator is a self-hosted practice space for people who are already committed to learning Dutch or German. They know which skill they want to work on—grammar, vocabulary, listening, speaking, reading—and where they are weak. Wordinator lets them go straight to that practice, shows them how far they have come, and uses the interface to guide them to what to do next.

The working title **Wordinator** may change.

## Who it is for

The target learner:

- is learning **Dutch** (the primary language) or **German**;
- is already committed: they study regularly and do not need to be persuaded, entertained, or retained with game mechanics;
- knows what they want to practise and expects the app to get out of the way and let them do it;
- practises at a **desktop** computer with a keyboard and a large screen.

Wordinator is not a public network, professional course provider, tutoring marketplace, or native-speaker matching service. Registration is open and immediate (see [authentication](authentication.md)); the community is small and the content is member-authored.

### Desktop first

New work is designed and verified for desktop viewports only. Mobile phones are not a target: phone support will be discontinued in the future. Existing phone layouts keep working and their tests keep passing until that change is made explicitly, but new features do not add phone-specific layouts, behaviors, or tests. See [product requirements](product-requirements.md#release-definition).

## What learners do

1. Choose the skill they want to practise and open a course or lesson aimed at it in the global [course library](courses.md).
2. Work through lessons: restricted rich text, practice blocks, new words, and synthesized [lesson speech](speech.md) for listening.
3. Collect and review words in the Words tab (see [words](words.md)).
4. Track progress: lesson and practice progress show what is finished and what comes next.
5. Optionally share sentences, questions, and exercises with other learners in the [journal](posts-and-feed.md).

Content comes from members; the platform does not ship a fixed curriculum. The member-authored Dutch Foundations content is described in [content](content/index.md).

## Product character

Wordinator should feel like a calm, focused study desk: modern, warm, tactile, and personal (see [design system](design-system.md)). Because learners are already motivated, the product favors directness over persuasion: the shortest path to the chosen practice, clear progress, and guidance toward the next useful step. Measuring progress and guiding learners through the interface are in scope. Points, streaks, rankings, leaderboards, and attention-maximizing mechanics are not: progress is personal and non-competitive.

## Why build it

General courses and apps decide what the learner practises next and pad sessions with motivation mechanics. Committed learners who already know their weak spots need a place where they pick the skill, practise it directly, and see their progress—with material written by people learning the same language.

## Business context

This is a private, non-commercial project. There is no current plan for monetization, a hosted service, or open-source distribution. Success means usefulness: committed learners return to it for the practice they choose and prefer it to scattered books, sites, and chats.

The expected load is small, so clarity and maintainability matter more than distributed-system scale.

## Explicit non-goals

- Mobile phone layouts or phone-specific features for new work
- Public discovery, public profiles, followers, or direct messages
- Platform-provided lessons or a fixed curriculum, translation, dictionaries, automated grammar correction, or pronunciation assessment
- Gamification: points, streaks, rankings, or leaderboards
- Automated language detection or enforcement
- Rich text, media posts, audio, or file attachments outside course lessons. Course lessons are a deliberate exception for restricted rich text and images, owned by [courses](courses.md#lesson-documents), and for synthesized [lesson speech](speech.md)
- Monetization or advertising
