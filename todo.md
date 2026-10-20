this file isn't meant for agents. don't read it if you're an agent.


[ ] words drill: practice with space
[x] drill results: gamify results page
[ ] drill results: practice failed words with ai session in drill's results page
[x] reset progress of lesson, should reset word fluency
[x] remove contribution section from course, as well as author's name from course and lessons everywhere
[ ] measure reading time
[ ] remove group-related tech-debts


Lesson Page
===========
[ ] leftrail indexes
[ ] mark course as complete at the end of the page
[ ] separate progress bar for practices
[ ] new words panel usability


AI
===
[ ] clean up initial prompt in tutor sections
[ ] tool calls, question answers with specific components fail to pass data from ui to the agent
[ ] tool calls to update progress of a course
[ ] pull up practice blocks from in-progress lessons
[ ] attach and (later on) suggest ai-added practices
[ ] ai can also help the user complete current practices interactively.
[ ] suggest speaking practices
[ ] read paragraphs and answer multiple questions
[ ] index grammar topics for look-up
[ ] practice for twenty minutes with timer
[ ] summery of conversations and need for dispatching summerization events

[x] user can fix his mistakes after seeing author's version when hits enter on a question. are we storing those mistakes too?
[x] "Pick up where you left off" should have multiple progresses for each lesson. also, for a lesson, undone practices mean incomplete progress.
[x] ai should also see a fluency level on a topic so that it can decide on moving on to the next sections or continuing with the existing ones.
[x] if all existing practices of a topic/concept was done recently by the user, ai should gravitate toward generating new excersises.

[~] redesign: mobile-friendly

[x] hide wordpanel and highlight with hovercard
[ ] speech: Daan is female and sofia male! voices are not interactive and excited! no background noise
[ ] voice for reading practices
[ ] add Jev: confidence in user's answer's correction

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
