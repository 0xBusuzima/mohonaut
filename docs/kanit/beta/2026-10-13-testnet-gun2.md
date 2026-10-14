# Beta economy report against `spec__base`

28-day flows per day (MOHN/day; SR = burned / emitted). Testnet prices are fake, so USD figures are not compared.
Emission runs only in hours when someone drills: on a quiet testnet the live figure sits below the schedule.

| Day | Metric   |     Live |  Sim 5 % | Sim 50 % | Sim 95 % | Verdict               |
| --: | -------- | -------: | -------: | -------: | -------: | --------------------- |
|   0 | emission |   148.84 |   148.81 |   148.81 |   148.81 | ok                    |
|   0 | burned   |     0.00 |     0.00 |     2.43 |   109.83 | ok                    |
|   0 | sr28     |     0.00 |     0.02 |     0.02 |     0.90 | below the 5 % band    |
|   1 | emission | 1,934.48 | 1,934.45 | 1,934.45 | 1,934.46 | ok                    |
|   1 | burned   |    52.45 |   109.45 |   240.87 | 1,425.79 | below the 5 % band    |
|   1 | sr28     |     0.03 |     0.05 |     0.09 |     0.90 | below the 5 % band    |
|   2 | emission | 3,347.51 | 3,719.22 | 3,719.22 | 3,719.37 | off schedule by 10.0% |
|   2 | burned   |   538.70 | 1,320.32 | 2,577.79 | 2,619.17 | below the 5 % band    |
|   2 | sr28     |     0.16 |     0.45 |     0.87 |     0.88 | below the 5 % band    |

**6 of 9 checks outside expectations.**

- day 0, sr28: below the 5 % band
- day 1, burned: below the 5 % band
- day 1, sr28: below the 5 % band
- day 2, emission: off schedule by 10.0%
- day 2, burned: below the 5 % band
- day 2, sr28: below the 5 % band
