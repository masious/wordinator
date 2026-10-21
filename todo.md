this file isn't meant for agents. don't read it if you're an agent.


[x] practice progress (current session)
[x] re-write leftrail for lesson page:
    [x] in this lesson
    [x] story icon
    [x] back to course: needs name of course
    [x] change grammar icon (e.g., note, paper, sticky note, open book, book)
    [x] only animate the icon for corresponding active section
    [x] summary icon's color
    [x] no bg and border for headings inside content + bigger static icon
[x] answer dialog -> inline expansion with small animation:
    [x] adding all questions
    [x] inline answer boxes
    [x] show the question at the top box by rendering it "active"
    [x] remove the repeated question at the bottom box
    [x] skip question button
    [x] share icon (no text) at the right side
    [x] put in order: drag and drop component
    [x] make everything smaller
    [x] remove "Nobody done yet · 8 questions left" subheading
    [x] for stacks, reuse the component for tutor's tool with multi-practices (dots)
    [x] "Matches the author’s version" should replace input(s) component
    [x] hide for practices with many questions: "Press Enter to check Shift+Enter for a new line."
[x] lesson right section
    [x] fixed search header
    [x] click icon to reset query inside input
    [x] move three buttons at the leftrail underneath, visible when not searching words
    [x] thicker library icon
    [x] smaller text in query input
    [x] matching items with query should be active (colorful)
    [x] header for footer section: Do more with AI (+ icon for header)
[x] dashboard progress box
    - no categories, single color
    - a brand new page for extra details on progress
    - Nothing to compare with yet -> Keep the hard work and we'll report progress soon!
[ ] ai: find goal co-relation of every two lessons in the existing schema
[~] measure reading time
[x] drill results: gamify results page
[x] reset progress of lesson, should reset word fluency
[x] remove contribution section from course, as well as author's name from course and lessons everywhere


[ ] remove group-related tech-debts
[ ] words drill: practice with space
[ ] voice for reading practices
[ ] add Jev: confidence in user's answer's correction
[ ] speech: Daan is female and sofia male! voices are not interactive and excited! no background noise


Lesson Page
===========
[x] leftrail indexes
[x] mark course as complete at the end of the page
[x] separate progress bar for practices
[x] new words panel usability

AI
===
[ ] debug: tool calls, question answers with specific components fail to pass data from ui to the agent

* Usages:
    * tutor: refresh my grammar about "leggen of zetten"
        - index grammar furthur for ai access.
        - word batching for ai access ... graph db?
    * words: after word drill
        * generating paragraphs requires word knowledge.
            - dictionary field in the tool call
            - word batching for ai access (graph/tagging words)
    * lesson: 
        * after each story:
            - summary and new words
            - comprehension practice with one-off questions
            - practice speaking dialog reading it loud
        * content between the two stories
            - explain grammar
            - one-off grammar practice every section
                - ask a question after every small section
                - with one question underneath with 3 answer options
            - tricky practices
        * after every lesson:
            - more practices including older vocab
            - mix grammar
        * every two-lessons:
            - Practice making similar dialogs and follow lesson goals.
            - some tricky grammar questions
            - weakest words

[ ] practice: attach and (later on) suggest ai-added practices
[ ] suggest speaking practices: Fluentli's Bot
[ ] ctx, practice: index grammar topics for look-up
[ ] ctx: clean up initial prompt in tutor sessions
[ ] (later) ctx: summery of conversations and need for dispatching summerization events
[ ] drill results: practice failed words with ai session in drill's results page


Done
======
[x] user can fix his mistakes after seeing author's version when hits enter on a question. are we storing those mistakes too?
[x] "Pick up where you left off" should have multiple progresses for each lesson. also, for a lesson, undone practices mean incomplete progress.
[x] ai should also see a fluency level on a topic so that it can decide on moving on to the next sections or continuing with the existing ones.
[x] if all existing practices of a topic/concept was done recently by the user, ai should gravitate toward generating new excersises.
[~] redesign: mobile-friendly
[x] hide wordpanel and highlight with hovercard
[x] remove members' tabs
[x] fix failing tests
[x] split e2e into different batches
[x] document e2e test isolation so that a change doesn't trigger all of it
[x] speech: autoplay of dialogue, fine-tunning
[x] overview of a lesson
[?] remove namespace
[x] course page
[x] practice: no new word panel when doing practices.
[x] bookmark words
[x] dangling playwright tests
[x] searching in new words panel
[x] practice block: show number of people done practice & have i done practice
[x] no reaction or comment to lesson answers
[x] practice: remove reveal answers. publish answer set -> done
[x] lesson page: no index and spyscrolls
[x] bookmark slide/block, question of a practice, examples
[x] progress tracking: show remaining practices from older lessons
[x] order of courses in prod
[x] decrease drill to 10 words
[x] Lesson practice: e should match é in practices
