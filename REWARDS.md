# Contributor Rewards Program

Tactical SPG Command 3D is built with help from the community. When the game
makes money, part of that money goes back to the people who built it.

> **Important:** This is a **voluntary, discretionary** program. It is not an
> employment contract, a partnership, equity, shares, or a promise of any
> fixed amount. If the game earns no revenue in a quarter, there is no
> payout for that quarter.

## 1. The rewards pool

- Each quarter, **20% of Net Revenue** goes into the Rewards Pool.
- **Net Revenue** = all revenue from the official game (ads, purchases,
  sponsorships, donations to the project) **minus**:
  - platform and payment fees,
  - hosting, servers, domains and other operating costs,
  - taxes and other legally required payments.
- Quarters follow the calendar: Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep,
  Q4 = Oct–Dec.

## 2. Earning points

Contributions earn **points**. The points measure the size and impact of the
work, not the number of lines.

| Points | Size | Examples |
|---:|---|---|
| 1 | Tiny | Typo fix, small bug with a clear fix, a well-written bug report with reproduction steps |
| 2 | Small | Simple bug fix, a small UI tweak, one translation file |
| 3 | Medium | A real bug fix that needs investigation, a small feature, a new piece of scenery |
| 5 | Large | A complete feature, a performance fix you can measure, a new piece of equipment |
| 8 | Major | A new game mode, a new map, a large system |
| 13 | Epic | Work spanning several systems. Agree on the points with the Maintainer before you start |

### How points are assigned

1. **Before you start:** the Maintainer labels issues with their points,
   using labels `points:1` to `points:13`. For work without an issue, open
   one first and ask for an estimate.
2. **At merge:** the final points are confirmed when the pull request is
   merged. They can change if the scope changed a lot.
3. **Only merged work counts.** Work that is later reverted because it was
   broken or caused harm loses its points.
4. Code, art, audio, level design, translations, testing reports and
   documentation can all earn points.
5. Work split into several pull requests on purpose to collect more points
   is counted as one piece of work.
6. The Maintainer's own work does not earn points. The Maintainer keeps the
   other 80% of Net Revenue.

All points are recorded publicly in [REWARDS_LEDGER.md](REWARDS_LEDGER.md).

## 3. How the pool is split

- Each quarter, the pool is split in proportion to the points each
  contributor earned in the **last 4 quarters** (a rolling 12-month window):

  ```
  your share = Rewards Pool × (your points in the window ÷ total points in the window)
  ```

- **Early contributor rule:** for the **first quarter with a payout**, every
  point earned since the project began counts, so work done before the game
  made money is still rewarded.

## 4. Payouts

- Payouts are calculated within 45 days after the end of each quarter.
- A **revenue report** for the quarter is published with the payout, showing
  gross revenue, deductions, Net Revenue and the pool amount.
- **Minimum payout: USD 20.** Smaller amounts carry over to the next quarter.
- Payment methods: GitHub Sponsors, PayPal, bank transfer, or another method
  both sides agree on.
- An amount unclaimed for **12 months** after it is announced goes back into
  the pool.

## 5. Eligibility

To receive a payout you must:

- have signed the [CLA](CLA.md);
- be at least 18 years old, or have a parent or guardian receive the payment
  for you;
- give the information needed to pay you and to meet legal and tax
  requirements;
- not be in a country or on a list that the law forbids paying.

**You are responsible for your own taxes.** The Maintainer may withhold
amounts if the law requires it.

## 6. Disqualification

The Maintainer may remove points from, or exclude, anyone who:

- games the system, for example with spam pull requests, fake issues or
  plagiarized work;
- submits code or assets they do not have the right to submit;
- seriously breaks the project's code of conduct.

## 7. Changes to this program

- Changes are announced at least **30 days** in advance in the repository.
- Points already recorded in the ledger keep their value.
- If the project is sold or shut down, the pool for the current quarter is
  still calculated and paid out.

## 8. Disputes

If you disagree with a points decision, open an issue within 30 days of the
merge. The Maintainer makes the final decision and explains it in the issue.
