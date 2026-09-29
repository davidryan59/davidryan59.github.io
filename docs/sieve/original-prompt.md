# Original prompt

The prompt David Ryan gave Claude Code on 2026-09-29, which started the sieve
app in `app/sieve/`. It is kept word for word.

---

I want a new interactive demo on my builder page

Call it drbuild.uk/sieve (app/sieve)

Based on Sieve of Erastothenes

Top row will be 0, 1, 2, 3, 4... 9
Next row will be 10, 11, 12, 13... 19

You have an open ended series of numbers, you can scroll down

You are able to change the width of the numbers so top row could be 0..11 or 0..23 or 0..59 or 0..999 or 0...999999999 etc, which means we may need to be able to scroll in 2 dimensions. Maybe that big number is the limit due to factorising? advise me of a suitable high limit?

Each number a tile in a 2D square grid. Start off all grey. Give 0 and 1 special colours. They can't be clicked. Then player clicks a sequence of numbers 2 and above

For original sieve of erastothenes, you had to click in order 2, 3, 5, 7, 11, 13... and it gives you exactly the primes

However in this interactive demo you can choose any series of "primes" that you like

For example, clicking 3 will cause 3 to be highlighted in the first colour (maybe bright green) and then all multiples of 3 to be highlighted in a less saturated version of the same colour (maybe light green). Then you cannot click any multiples of 3, 6, 9...

But you could click 4, and make it the next prime. 4 might be bright blue, and 8, 16, 20, 28, 32 etc would be light blue. (12, 24, 36 already light green)

Then you might click 2, and make it the next "prime". 2 could be bright yellow, 10, 14, 22, 26... would be light yellow

Any prime that is clicked on can be clicked off. I am not sure if we restrict the player to click off the "primes" in the reverse order they were clicked on.

Sound good?

Extension - allow the numbers to be displayed in different bases
- decimal
- base 3 through 9
- dozenal
- hexadecimal (0-9, a-f)
- I am open to further bases if you like any more?

For the non-decimal bases we should perhaps display the non-decimal base in the normal size (larger) font, and the decimal number in much smaller font below it, so player doesn't get confused

I say player but its not really a competitive game, its more an interactive educational toy

OK! sound good? any questions? let's build

please make this a suitable separate area (a folder?) on my builder site, linked to from builder front page with suitable paragraph in suitable place, and make sure this prompt is saved as "original-prompt.md"
