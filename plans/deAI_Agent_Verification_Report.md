# deAI Agent Mode Verification Report

Time: 2026-08-04T11:02:18.101Z
Text: 3513 chars, 42 paragraphs
Result: 35 PASS / 0 FAIL / 35 Total
Rate: 100.0%

## Details

1. [PASS] T1: Text injected - OK len=3595
2. [PASS] T2: 3+ segments - count=3
3. [PASS] T2: All sizes in floating window - sizes=[1279,1279,1033]
4. [PASS] T2: Segment texts non-zero - segSum=3591
5. [PASS] T3: Segments end at sentence boundary - ends=["。","。","。"]
6. [PASS] T4: Merge restores original - o=3595 m=3595
7. [PASS] T5: Mode=split-merge
8. [PASS] T5: Split group visible - vis=block
9. [PASS] T5: Mode=chain
10. [PASS] T5: Split group hidden - vis=none
11. [PASS] T6: Below min clamped to 500 - got=500
12. [PASS] T6: Above max clamped to 3000 - got=3000
13. [PASS] T6: Normal accepted - got=1500
14. [PASS] T7: Has split-merge branch
15. [PASS] T7: Has early return
16. [PASS] T8: Returns on skill-not-found
17. [PASS] T8: Preserves original length - o=3595 r=3595
18. [PASS] T9: Modal visible
19. [PASS] T9: 4 steps shown - cnt=4
20. [PASS] T10: Step0 done - deai-step-item done
21. [PASS] T10: Step1 active - deai-step-item active
22. [PASS] T10: Step2 pending - deai-step-item pending
23. [PASS] T10: Pct>0 - pct=50%
24. [PASS] T11: Cancel button exists
25. [PASS] T12: Failed seg falls back to original - m=XXX

BBB

ZZZ
26. [PASS] T12: Successful segs preserved
27. [PASS] T13: Config mode saved
28. [PASS] T13: Config size saved
29. [PASS] T14: Size=500 splits=6 in[350,650] - s=[616,577,618,581,604,589]
30. [PASS] T14: Size=800 splits=4 in[560,1040] - s=[1033,1030,1029,497]
31. [PASS] T14: Size=1500 splits=2 in[1050,1950] - s=[1897,1696]
32. [PASS] T14: Size=2000 splits=2 in[1400,2600] - s=[2560,1033]
33. [PASS] T14: Size=3000 splits=1 in[2100,3900] - s=[3595]
34. [PASS] T15: Editor 3500+ chars - len=3595
35. [PASS] T15: Word count displays - wc=3513 字

## Bug Fixed
_splitText connector assignment off by one. Fix: nextConnector delay variable.