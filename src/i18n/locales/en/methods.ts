import type { Method } from '../../../types.ts';
import type { methods as De } from '../de/methods.ts';

// Learning methods per task type (English) – must have exactly the same keys as de/methods.ts
export const methods: Record<keyof typeof De, Method> = {
  'table.mul': {
    idea: 'The times tables have to be automatic. Where you hesitate, three anchors help: × 2 (double), × 5 (half of × 10) and × 10 (append a zero). Build everything else from them.',
    steps: [
      'Take the larger factor and check whether a rule fits right away: × 10, × 9 (= × 10 minus once), × 5, × 4 (double twice), × 3, × 2.',
      'For 6, 7 or 8, split into 5 + rest: 7 × 8 = 7 × 5 + 7 × 3.',
      'Work out the partial products and add them.',
      'Note the fact you hesitated on and drill it specifically.',
    ],
    trick: '7 × 8 = 35 + 21 = 56. And 6 × 9 = 60 − 6 = 54. For the 9 times table, the digits of the result always add up to 9 (54 → 5 + 4).',
    pitfalls: [
      'Mixing up similar results, e.g. 6 × 8 = 48 and 7 × 7 = 49, or 7 × 8 = 56 and 6 × 9 = 54.',
      'Forgetting to subtract for × 9 and giving the × 10 result.',
    ],
  },
  'table.div': {
    idea: 'Every times-table division is a multiplication in reverse. Instead of dividing, ask: which number times the divisor gives the starting number?',
    steps: [
      'Read the task as a gap: 56 ÷ 7 = ? means 7 × ? = 56.',
      'Run through the divisor’s times table or jump via an anchor (7 × 5 = 35, 7 × 10 = 70).',
      'The missing factor is the result.',
      'Check: result × divisor must give the starting number.',
    ],
    trick: '56 ÷ 7: 7 × 5 = 35, 21 short of 56 = 3 × 7, so 5 + 3 = 8.',
    pitfalls: [
      'Swapping divisor and result (56 ÷ 7 = 8, not 7).',
      'Dropping one digit too many when dividing by 10.',
    ],
  },
  'mult.2x1': {
    idea: 'You never have to multiply a two-digit number in one go. Split it into tens and ones, multiply each part separately and add.',
    steps: [
      'Split the two-digit number into tens and ones.',
      'Multiply the tens part by the single digit (multiply the digits, append the zero).',
      'Multiply the ones part by the single digit.',
      'Add both partial results.',
    ],
    trick: '76 × 8 = 70 × 8 + 6 × 8 = 560 + 48 = 608. If the number sits just below a ten, go backwards: 69 × 6 = 70 × 6 − 6 = 420 − 6 = 414.',
    pitfalls: [
      'Forgetting the zero on the tens part (7 × 8 = 56 means 560 here, not 56).',
      'Losing the carry when adding: tens first (560 + 40), then ones (+ 8).',
    ],
  },
  'mult.2x2': {
    idea: 'Split the second factor so that one part is a “round” factor (10, 20, 25, 50). Then only two easy partial products are left.',
    steps: [
      'Pick the factor that is easier to split (e.g. close to 20, 25, 30, 50 or 100).',
      'Split it into a round part plus or minus a small rest.',
      'Work out the partial products (× 25 = × 100 ÷ 4, × 20 = × 2 with a zero appended).',
      'Add (or subtract) the partial products.',
    ],
    trick: '34 × 27 = 34 × 25 + 34 × 2 = 850 + 68 = 918. Alternatively 27 = 30 − 3: 34 × 30 − 34 × 3 = 1,020 − 102 = 918.',
    pitfalls: [
      'Dropping a part when splitting, e.g. only working out 34 × 25 and leaving out the rest.',
      'Adding the rest instead of subtracting it in a “minus” split.',
      'Splitting both numbers at once (4 partial products) – split only one, it saves memory.',
    ],
  },
  'mult.easy': {
    idea: '5, 25 and 50 are fractions of 10, 100 and 100. Instead of multiplying, append zeros and halve or quarter.',
    steps: [
      '× 5: first × 10, then ÷ 2.',
      '× 25: first × 100, then ÷ 4 (halve twice).',
      '× 50: first × 100, then ÷ 2.',
      'For odd numbers: halve in parts (hundreds, tens, ones) or work with decimals.',
    ],
    trick: '48 × 25 = 4,800 ÷ 4 = 1,200. And 86 × 5 = 860 ÷ 2 = 430; 46 × 50 = 4,600 ÷ 2 = 2,300.',
    pitfalls: [
      'Dividing by 2 instead of 4 for × 25.',
      'The wrong number of zeros for × 50: 50 = 100 ÷ 2, so append two zeros, not one.',
    ],
  },
  'mult.square': {
    idea: 'A square can be written as the product of two symmetric neighbours plus a rest: a² = (a − d) × (a + d) + d². Choose d so that one factor becomes round.',
    steps: [
      'Round a to the nearest ten and call the distance d.',
      'Form (a − d) and (a + d); one of them is a round ten.',
      'Multiply the two numbers (multiply the digits, append the zero).',
      'Add d² (at most 25 for d ≤ 5).',
    ],
    trick: '45² = 40 × 50 + 5² = 2,000 + 25 = 2,025. And 67² = 64 × 70 + 3² = 4,480 + 9 = 4,489. Numbers ending in 5 always square to …25.',
    pitfalls: [
      'Forgetting d² or adding d instead of d².',
      'Not working symmetrically: (a − d) and (a + d) must be the same distance from a.',
    ],
  },

  'div.exact': {
    idea: 'Split the number into blocks you can divide directly by the divisor and add the results. It is the reverse of splitting when multiplying.',
    steps: [
      'Split the number into a round block (a multiple of the divisor, e.g. hundreds or thousands) and a rest.',
      'Divide the round block by the divisor.',
      'Divide the rest by the divisor.',
      'Add both results. Check: result × divisor must give the starting number.',
    ],
    trick: '1,248 ÷ 4 = 1,200 ÷ 4 + 48 ÷ 4 = 300 + 12 = 312. For ÷ 25: first ÷ 100, then × 4: 1,650 ÷ 25 = 16.5 × 4 = 66.',
    pitfalls: [
      'Forgetting the rest and only dividing the round block.',
      'Shifting a place value: 300 + 12 is 312, not 3,012.',
    ],
  },
  'div.decimal': {
    idea: 'Dividing by a decimal means multiplying by its reciprocal. Move the decimal point in both numbers until you divide by a whole number.',
    steps: [
      'Spot the fraction: 0.5 = ½, 0.25 = ¼, 0.2 = ⅕, 0.4 = ⅖, 0.8 = ⅘.',
      'For 0.25 / 0.5 / 0.2: simply multiply by 4 / 2 / 5.',
      'Otherwise move the decimal point equally in divisor and number (× 10) and divide by the whole number.',
      'Sanity check: dividing by a number below 1 makes the result larger.',
    ],
    trick: '360 ÷ 0.8 = 3,600 ÷ 8 = 450. And 90 ÷ 0.25 = 90 × 4 = 360; 75 ÷ 1.5 = 750 ÷ 15 = 50.',
    pitfalls: [
      'Moving the decimal point only in the divisor and not in the number (result off by a factor of 10).',
      'Giving a smaller result even though you divide by less than 1.',
      'Confusing ÷ 0.25 with ÷ 4 – it is × 4.',
    ],
  },
  'div.round': {
    idea: 'Estimate with a multiple of the divisor within reach and correct the small rest. To the nearest whole number, one or two steps are enough.',
    steps: [
      'Find a known multiple of the divisor close to the number (e.g. 7 × 170 = 1,190).',
      'Work out the rest: number minus multiple.',
      'Divide the rest roughly by the divisor (a fraction of 1 up to about 10).',
      'Add and round to a whole number.',
    ],
    trick: '1,200 ÷ 7: 7 × 170 = 1,190, rest 10, 10 ÷ 7 ≈ 1.4 → 171.4 ≈ 171. For ÷ 11: divide by 10, then take off about 10%.',
    pitfalls: [
      'Rounding down instead of up when the decimal is ≥ 0.5.',
      'Ignoring the rest and only giving the rounded multiple.',
    ],
  },

  'big.mult': {
    idea: 'Separate digits and zeros. Multiply only the small numbers and count the powers of ten separately: K = 10³, M = 10⁶, B = 10⁹.',
    steps: [
      'Write each number as digits × power of ten (3.5M = 3.5 × 10⁶; 400 = 4 × 10²).',
      'Multiply the digit parts (3.5 × 4 = 14).',
      'Add the exponents (10⁶ × 10² = 10⁸).',
      'Combine and convert to the right unit (14 × 10⁸ = 1.4 × 10⁹ = 1.4B).',
    ],
    trick: '3.5M × 400 = (3.5 × 4)M × 100 = 14M × 100 = 1,400M = 1.4B.',
    pitfalls: [
      'Miscounting zeros: “M × 100” is two more zeros, so 1,400M and not 140M.',
      'Forgetting that 1,000M = 1B when converting.',
      'Not adjusting the unit asked for (K/M/B) at the end.',
    ],
  },
  'big.div': {
    idea: 'When dividing, also separate digits and zeros: divide the digits, subtract the exponents. That way you never work with long strings of zeros.',
    steps: [
      'Write numerator and denominator as digits × power of ten (12B = 12 × 10⁹; 400,000 = 4 × 10⁵).',
      'Divide the digit parts (12 ÷ 4 = 3).',
      'Subtract the exponents (10⁹ ÷ 10⁵ = 10⁴).',
      'Combine (3 × 10⁴ = 30,000) and convert to the unit asked for (30K).',
    ],
    trick: '12B ÷ 400,000 = (12 ÷ 4) × 10⁹⁻⁵ = 3 × 10⁴ = 30,000 = 30K. Check: 30,000 × 400,000 = 12,000,000,000.',
    pitfalls: [
      'Adding exponents instead of subtracting them.',
      'Miscounting the zeros in the denominator (400,000 has 5 zeros, so 4 × 10⁵).',
      'Giving the result in the wrong unit: 30,000 is 30K, not 30M.',
    ],
  },
  'big.percapita': {
    idea: 'Cancel the units first, then you only work with small numbers. B ÷ M is a factor of 1,000.',
    steps: [
      'Bring both numbers to the same unit (2.4B = 2,400M).',
      'Divide the numbers in front of the unit (2,400 ÷ 84); M ÷ M cancels out.',
      'Work roughly: simplify or round the denominator (84 ≈ 85, 2,400 ÷ 85 ≈ 28).',
      'Check the order of magnitude: euros per person from billions of euros and millions of people is usually in the tens or hundreds.',
    ],
    trick: '€2.4B ÷ 84M = €2,400M ÷ 84M = 2,400 ÷ 84 ≈ €28.6. Check: 84 × 28.6 ≈ 2,400.',
    pitfalls: [
      'Not aligning B and M and ending up off by a factor of 1,000.',
      'Rounding too much with a 3% tolerance – round the denominator by 1–2% at most.',
    ],
  },

  'pct.of': {
    idea: 'Build every percentage from 10% and 1% blocks. You get both by moving the decimal point, without calculating.',
    steps: [
      '10% = move the decimal point one place left; 1% = two places.',
      'Split the percentage into blocks (17% = 10% + 5% + 2%; 5% = half of 10%).',
      'Work out the partial values and add them.',
      'For awkward numbers: swap percentage and base (x% of y = y% of x).',
    ],
    trick: '17% of 2,400 = 240 + 7 × 24 = 240 + 168 = 408. Swap: 8% of 50 = 50% of 8 = 4.',
    pitfalls: [
      'Confusing 10% and 1% (decimal point moved one place instead of two).',
      'Adding a block twice or forgetting one.',
    ],
  },
  'pct.change': {
    idea: 'The percentage change always measures the difference against the starting value, i.e. the old value.',
    steps: [
      'Work out the difference: new − old (with its sign).',
      'Divide by the old value (never by the new one).',
      'Convert to percent: simplify the fraction and compare with known fractions (¼ = 25%, ⅕ = 20%, ⅛ = 12.5%).',
      'Check the sign: an increase is positive, a decrease negative.',
    ],
    trick: '80 → 100: difference 20, 20 ÷ 80 = ¼ = 25%. From 100 → 80: −20 ÷ 100 = −20% (not −25%).',
    pitfalls: [
      'Dividing by the new value instead of the old one.',
      'A 25% increase and a 25% decrease do not cancel out – the base is different each time.',
    ],
  },
  'pct.reverse': {
    idea: 'The final price is the original price times a factor. To work backwards, divide by that factor. Adding percentages of the final price is misleading because they refer to a different base.',
    steps: [
      'Find the factor: 25% discount → 0.75; 10% increase → 1.1.',
      'Divide the final price by the factor. Tip: turn it into a fraction (0.75 = ¾).',
      'Alternative with parts: 75% is 3 equal parts. One part is the final price ÷ 3, the whole is 4 parts.',
      'Check: original price × factor must give the final price.',
    ],
    trick: '25% discount, final price €90: 90 ÷ 0.75 = €120. With parts: 90 ÷ 3 = 30 per part, × 4 = 120. With +10% and a final price of €66: 66 ÷ 1.1 = €60.',
    pitfalls: [
      'Working back from a discount by adding 25% of 90 (gives 112.50) – it is 90 ÷ 0.75 = 120.',
      'Dividing by the wrong factor: a 25% discount means 0.75, not 0.25 or 1.25.',
      'Subtracting for an increase instead of dividing by 1.1 (66 − 10% = 59.4 is wrong).',
    ],
  },
  'pct.points': {
    idea: 'Percentage points are the difference between two percentages. The percentage change relates that difference to the starting value.',
    steps: [
      'Work out the difference in percentage points: new value − old value.',
      'Divide this difference by the old percentage.',
      'Convert to percent (compare with known fractions).',
      'Phrase it precisely: “+2 percentage points” is not “+2%”.',
    ],
    trick: 'Margin 8% → 10%: +2 percentage points, 2 ÷ 8 = ¼ = +25%. Margin 20% → 25%: 5 ÷ 20 = +25%.',
    pitfalls: [
      'Giving the percentage-point difference as the relative change (“+2%” instead of “+25%”).',
      'Dividing by the new percentage instead of the old one.',
    ],
  },
  'pct.chain': {
    idea: 'Successive changes multiply, they do not add. Work with factors and multiply them.',
    steps: [
      'Turn each change into a factor (+20% → 1.2; −25% → 0.75).',
      'Multiply the factors (1.2 × 0.8 = 0.96).',
      'Subtract 1 and convert to percent (0.96 − 1 = −0.04 → −4%).',
      'Quick check for small numbers: add them plus a product correction: a + b + a·b ÷ 100.',
    ],
    trick: '+20% and −20%: 1.2 × 0.8 = 0.96 → −4%. And +50% then −50%: 1.5 × 0.5 = 0.75 → −25%. +10% twice: 1.1 × 1.1 = 1.21 → +21%.',
    pitfalls: [
      'Simply adding the percentages (+20% and −20% do not make 0%).',
      'Forgetting the sign when the factor is below 1.',
      'Building factors wrongly: −25% is 0.75, not 0.25.',
    ],
  },

  'frac.topct': {
    idea: 'You need to know the common fractions by heart. Derive all others from the basic fractions.',
    steps: [
      'Learn the basic fractions: ½ = 50%, ⅓ = 33.3%, ¼ = 25%, ⅕ = 20%, ⅙ = 16.7%, ⅛ = 12.5%, ⅒ = 10%.',
      'For numerators > 1: unit fraction times numerator (⅜ = 3 × 12.5%).',
      'Or subtract from the whole (⅚ = 100% − 16.7%).',
      'For 1/7 ≈ 14.3%, 1/9 ≈ 11.1%, 1/11 ≈ 9.1%: remember the pattern (1/7 = 142857…).',
    ],
    trick: '3/8 = 3 × 12.5% = 37.5%. 5/6 = 100% − 16.7% = 83.3%. 2/3 = 2 × 33.3% = 66.7%.',
    pitfalls: [
      'Swapping numerator and denominator (do not work out ⅜ as 8/3).',
      'Confusing ⅙ with ⅛ (16.7% versus 12.5%).',
    ],
  },
  'frac.of': {
    idea: 'A fraction of a number means: divide by the denominator first, then multiply by the numerator. That keeps the numbers small.',
    steps: [
      'Divide the number by the denominator (that is one unit-fraction part).',
      'Multiply the result by the numerator.',
      'For large numbers: split off the zeros, divide, then append the zeros again.',
      'Check: the result lies between 0 and the starting number.',
    ],
    trick: '3/8 of 640 = 640 ÷ 8 × 3 = 80 × 3 = 240. And 2/5 of 350 = 350 ÷ 5 × 2 = 70 × 2 = 140.',
    pitfalls: [
      'Multiplying by the numerator first and dividing afterwards – bigger numbers and more mistakes.',
      'Multiplying by the denominator instead of dividing.',
    ],
  },

  'growth.compound': {
    idea: 'Compound growth is only a little more than the sum of the individual years. Add up the percentages and correct with a small extra.',
    steps: [
      'Add the percentages: n × r.',
      'Add the compounding part: number of year pairs n(n − 1)/2 times r²/100.',
      'For r ≥ 15 or n ≥ 4, better work with factors (1.2² = 1.44).',
      'The tolerance is generous, so the extra only needs to be roughly right.',
    ],
    trick: '5% over 3 years: 3 × 5 = 15%, plus 3 pairs × 0.25 = 0.75 ⇒ ≈ 15.8% (exactly 1.05³ = 1.157625). 10% over 3 years: 30 + 3 + 0.1 = 33.1%.',
    pitfalls: [
      'Only working out n × r and leaving out the compounding (at 10% over 3 years, 3 percentage points are already missing).',
      'Making the extra too large – at 5% it is only about 1 percentage point.',
    ],
  },
  'growth.rule72': {
    idea: 'The rule of 72: at a growth rate of r% per year, a value doubles in about 72 ÷ r years.',
    steps: [
      'Divide 72 by the rate in percent.',
      'Ideally the rate divides 72 cleanly (2, 3, 4, 6, 8, 9, 12, 18, 24 are divisors of 72).',
      'For awkward rates: round the rate to a divisor and adjust the result slightly.',
      'Sanity check: twice the rate, half the doubling time.',
    ],
    trick: '8% growth: 72 ÷ 8 = 9 years. 12%: 72 ÷ 12 = 6 years. 3%: 72 ÷ 3 = 24 years.',
    pitfalls: [
      'Using 70 or 100 instead of 72 (70 is an acceptable approximation, 100 is not).',
      'Plugging in the rate as a decimal (0.08 instead of 8).',
    ],
  },
  'growth.cagr': {
    idea: 'From the total factor over n years you find the annual rate by recognising the factor as an n-th power. Know the powers of 1.05 / 1.1 / 1.2 / 1.25 / 1.5 by heart.',
    steps: [
      'Work out the total factor: end value ÷ start value.',
      'Compare with known powers (1.1² = 1.21; 1.1³ = 1.331; 1.2² = 1.44; 1.2³ = 1.728; 1.5² = 2.25).',
      'The matching base factor minus 1 is the annual rate.',
      'Check: start value × base factor^n must give the end value.',
    ],
    trick: '400 → 900 in 2 years: factor 900 ÷ 400 = 2.25 = 1.5² → 50% per year. 100 → 121: factor 1.21 = 1.1² → 10%.',
    pitfalls: [
      'Dividing the total growth by n (125% over 2 years is not 62.5% per year).',
      'Not subtracting 1 from the factor (1.5 means 50%, not 150%).',
    ],
  },

  'biz.payback': {
    idea: 'The payback period tells you after how many years an investment pays for itself through the annual savings or profit.',
    steps: [
      'Divide the investment by the annual savings.',
      'Cancel matching units (€M ÷ €M/year = years).',
      'Decimals: double both numbers to get rid of the decimal point (12 ÷ 2.5 = 24 ÷ 5).',
      'Check: savings × result ≈ investment.',
    ],
    trick: '€12M ÷ €2.5M/year = 24 ÷ 5 = 4.8 years. Check: 2.5 × 4.8 = 12.',
    pitfalls: [
      'Turning the calculation around (savings ÷ investment).',
      'Using gross instead of net savings when running costs have to be deducted.',
    ],
  },
  'biz.breakeven': {
    idea: 'Every unit sold contributes its contribution margin (price − variable cost) towards the fixed costs. Break-even is reached when the contributions cover the fixed costs.',
    steps: [
      'Work out the contribution margin per unit: price − variable cost.',
      'Divide the fixed costs by the contribution margin.',
      'Work with the zeros split off (thousands separately) and append them again at the end.',
      'Check: quantity × contribution margin ≈ fixed costs.',
    ],
    trick: 'Fixed costs €600,000, price €50, variable cost €35: contribution margin €15, 600,000 ÷ 15 = 40,000 units (600 ÷ 15 = 40, plus 3 zeros).',
    pitfalls: [
      'Dividing by the price instead of the contribution margin.',
      'Not subtracting the variable costs.',
      'Losing the zeros when simplifying (not appending the thousands again).',
    ],
  },
  'biz.margin': {
    idea: 'The margin is profit as a share of revenue. It is simply the percentage question “profit is what percent of revenue?”.',
    steps: [
      'Divide the profit by the revenue.',
      'Simplify to an easy fraction.',
      'Convert the fraction to percent (¼ = 25%, ⅒ = 10%, ⅕ = 20%).',
      'Alternatively: find 1% of revenue and count how often it fits into the profit.',
    ],
    trick: 'Profit €12M, revenue €240M: 1% = €2.4M, 12 ÷ 2.4 = 5 → 5% margin. Check: 5% of 240 = 12.',
    pitfalls: [
      'Dividing by the costs instead of the revenue.',
      'Confusing the margin in percentage points with absolute values.',
    ],
  },
  'biz.roi': {
    idea: 'ROI measures net gain relative to the cost invested: (benefit − cost) ÷ cost.',
    steps: [
      'Subtract the cost from the benefit (net gain).',
      'Divide the net gain by the cost (not by the benefit).',
      'Convert to percent.',
      'Sanity check: a benefit twice the cost gives 100% ROI.',
    ],
    trick: 'Cost €8M, benefit €10M: gain 2, 2 ÷ 8 = ¼ = 25% ROI.',
    pitfalls: [
      'Working out benefit ÷ cost and not subtracting 1 (125% instead of 25%).',
      'Dividing by the benefit instead of the cost.',
    ],
  },
  'biz.tco': {
    idea: 'TCO (total cost of ownership) is the one-off cost plus all running costs over the whole term.',
    steps: [
      'Work out the running costs over the term: years × cost per year.',
      'Add the one-off cost.',
      'With decimals: multiply whole and decimal parts separately (4 × 2.5 = 4 × 2 + 4 × 0.5).',
      'Check that all items use the same unit (€M).',
    ],
    trick: 'One-off €5M, running €2.5M/year, 4 years: 4 × 2.5 = 10, 5 + 10 = €15M.',
    pitfalls: [
      'Counting the one-off cost every year.',
      'Using the wrong number of years (the term, not the number of payments in year 0).',
    ],
  },
  'biz.fte': {
    idea: 'Chain the units: requests × minutes → total minutes → hours → FTE. Apply the savings share only once.',
    steps: [
      'Work out the total minutes: requests per year × minutes per request.',
      'Apply the savings share (25% = ÷ 4, 50% = ÷ 2, 10% = move the decimal point).',
      'Convert to hours (÷ 60).',
      'Divide by the hours per FTE and round roughly.',
    ],
    trick: '1.2M requests × 5 min × 25% ÷ 60 ÷ 1,500: 1.2M × 5 = 6M min, ÷ 4 = 1.5M min, ÷ 60 = 25,000 h, ÷ 1,500 ≈ 16.7 FTE.',
    pitfalls: [
      'Forgetting the step from minutes to hours (÷ 60).',
      'Not applying the savings share, or using the remaining share (75%).',
      'Losing the millions when converting – count the zeros separately.',
    ],
  },
  'biz.sla': {
    idea: 'The allowed downtime is the unavailability share times the time in a year. Remember: one year = 8,760 hours.',
    steps: [
      'Work out the downtime share: 100% − availability (99.9% → 0.1%).',
      'Take that percentage of 8,760 h (0.1% = 1/1,000 → 8.76 h).',
      'For 99.99%: work in minutes (1 year = 525,600 min), 0.01% ≈ 52.6 min.',
      'Downtime scales with the share: half the share, half the time.',
    ],
    trick: '99.9%: 0.1% of 8,760 h = 8.76 h ≈ 8.8 h. 99.5%: 0.5% of 8,760 = 43.8 h. 99.99%: 0.01% of 525,600 min ≈ 52.6 min.',
    pitfalls: [
      'Using the availability instead of the downtime share.',
      'Confusing percent and per mille – 0.1% is 1/1,000, not 1/100.',
      'Giving 99.99% in hours instead of minutes.',
    ],
  },

  'est.mult': {
    idea: 'When estimating, round so that the errors cancel out: one number up, the other down. That keeps you within the ±8% tolerance.',
    steps: [
      'Round both factors to one or two significant digits.',
      'Round in opposite directions where possible (one factor up, the other down).',
      'Multiply the round numbers, count the zeros separately.',
      'Check that the combined rounding error stays below about 8%.',
    ],
    trick: '487 × 21 ≈ 500 × 20 = 10,000 (exactly 10,227, about 2% off).',
    pitfalls: [
      'Rounding both numbers in the same direction – the errors add up.',
      'Rounding too coarsely (e.g. 21 to 30).',
    ],
  },
  'est.div': {
    idea: 'Round numerator and denominator to nearby numbers that divide nicely. Change both by roughly the same share and the quotient stays stable.',
    steps: [
      'Round the denominator to a round number (39 → 40).',
      'Adjust the numerator to a multiple of the rounded denominator (7,830 → 8,000).',
      'Divide, counting the zeros separately.',
      'Check the order of magnitude with a reverse check.',
    ],
    trick: '7,830 ÷ 39 ≈ 8,000 ÷ 40 = 200 (exactly 200.8).',
    pitfalls: [
      'Rounding only the denominator and leaving the numerator.',
      'Miscounting zeros: 8,000 ÷ 40 = 200, not 2,000.',
    ],
  },
  'est.pct': {
    idea: 'Replace the awkward percentage with a neighbour that is an easy fraction (10, 20, 25, 50%) and correct the difference.',
    steps: [
      'Round the percentage to a neighbouring rate (23% → 25%).',
      'Round the base to a round number (4,870 → 4,800).',
      'Work out the round percentage (25% = ÷ 4).',
      'Correct the difference: 1% of the base per percentage point of difference.',
    ],
    trick: '23% of 4,870 ≈ 25% of 4,800 − 2% of 4,800 = 1,200 − 96 = 1,104 (exactly 1,120).',
    pitfalls: [
      'Forgetting the correction and staying inaccurate (1,200 is almost 7% off).',
      'Correcting in the wrong direction: 23% < 25%, so subtract.',
    ],
  },

  'units.dimless': {
    idea: 'Units behave like numbers: they cancel. A quantity becomes dimensionless (a pure share) when you divide it by something with exactly the same unit.',
    steps: [
      'Write the unit of the given quantity as a fraction (€/year = € per year).',
      'Work out what must be in the denominator for everything to cancel: the same unit, including the same time base.',
      'Cancel numerator and denominator units against each other.',
      'Check what is left: nothing = dimensionless (a share or a rate).',
    ],
    trick: 'Revenue [€/year] ÷ market volume [€/year] = market share (no unit). Likewise downtime [h/year] ÷ hours per year [h/year] = share.',
    pitfalls: [
      'Mixing time bases: €/month divided by €/year does not cancel cleanly (off by a factor of 12).',
      'Taking the reciprocal: market volume ÷ revenue is dimensionless too, but not the share you are looking for.',
    ],
  },
  'units.result': {
    idea: 'When multiplying and dividing, treat units like fractions: the same units in numerator and denominator cancel, the rest is the unit of the result.',
    steps: [
      'Write both units as fractions, one below or next to the other.',
      'Multiplication: numerator times numerator, denominator times denominator. Division: multiply by the reciprocal.',
      'Cancel everything that appears both above and below.',
      'Read off the remaining unit and check that it fits the question.',
    ],
    trick: '€/h × h/year = €/year (h cancels). Units/day × €/unit = €/day. € ÷ employees = €/employee.',
    pitfalls: [
      'Forgetting the reciprocal when dividing: ÷ (h/year) means × (year/h).',
      'Not cancelling a unit even though it appears above and below.',
    ],
  },
  'units.convert': {
    idea: 'You convert by chaining conversion factors so that the unwanted units cancel and only the one you want is left.',
    steps: [
      'Write down the starting quantity with its unit and note the target unit.',
      'Choose conversion factors with the old unit in the denominator and the new one in the numerator (1 year = 12 months).',
      'Multiply the numbers, cancel the units and count zeros separately.',
      'Sanity check: if the unit gets smaller, the number gets bigger, and vice versa.',
    ],
    trick: '36 km/h = 36,000 m ÷ 3,600 s = 10 m/s (rule of thumb: ÷ 3.6). Monthly value × 12 = annual value. 220 working days × 8 h = 1,760 h per year. €0.5/min × 60 = €30/h.',
    pitfalls: [
      'Applying the factor the wrong way (÷ 12 instead of × 12 when scaling up to a year).',
      'Converting only part of the unit, e.g. km to m but not h to s.',
      'Miscounting zeros with K / M (120K × 12 = 1.44M, not 14.4M).',
    ],
  },

  'mag.exponent': {
    idea: 'Every number can be written as a × 10ⁿ with 1 ≤ a < 10. The exponent n is the order of magnitude: it tells you how many digits the number has.',
    steps: [
      'For large numbers, count the digits before the decimal point; n = number of digits − 1 (85,000 has 5 digits, n = 4).',
      'For unit words: K = 10³, M = 10⁶, B = 10⁹, T = 10¹². Then mind a: 4.2B = 4.2 × 10⁹, so n = 9.',
      'For decimals below 1: find the first non-zero digit. Its position after the decimal point is −n (0.003 → n = −3).',
      'Check that a is between 1 and 10; otherwise move the decimal point and adjust n (12 × 10⁶ = 1.2 × 10⁷).',
    ],
    trick: '4.2B = 4.2 × 10⁹ → n = 9. 85,000 = 8.5 × 10⁴ → n = 4. 0.003 = 3 × 10⁻³ → n = −3. 0.047 = 4.7 × 10⁻² → n = −2.',
    pitfalls: [
      'Taking the number of digits instead of digits − 1: 85,000 has 5 digits, but n = 4.',
      'For numbers below 1, forgetting the sign or being off by one (0.003 is 10⁻³, not 10⁻²).',
      'Mapping the unit wrongly: B is 10⁹, T is 10¹², not 10¹⁵.',
    ],
  },
  'mag.facts': {
    idea: 'A short list of anchor values lets you estimate orders of magnitude confidently in cases. Remember the number and derive the exponent from it.',
    steps: [
      'Recall the anchor value (population of Germany ≈ 84M).',
      'Write it as a × 10ⁿ (84M = 8.4 × 10⁷).',
      'Read off n: the exponent of the power of ten.',
      'Use the anchor to place related quantities (households ≈ half the population, so the same order of magnitude).',
    ],
    trick: 'Population of Germany 84M ≈ 8 × 10⁷ (n = 7). Households 41M, people in work 46M (both n = 7). EU 450M = 4.5 × 10⁸. World 8.2B = 8.2 × 10⁹. German GDP ≈ €4.3T = 4.3 × 10¹². 1 year ≈ 3.15 × 10⁷ s. 8,760 h per year (n = 3). About 1,700 working hours per FTE (n = 3).',
    pitfalls: [
      'Confusing M and B: Germany has millions of inhabitants (10⁷), the world billions (10⁹).',
      'Swapping trillions (10¹²) and billions (10⁹) for GDP. Careful: German “Billion” = trillion, “Milliarde” = billion.',
    ],
  },
  'mag.product': {
    idea: 'For products in powers-of-ten notation, multiply the mantissas and add the exponents. Then check that the mantissa is still between 1 and 10.',
    steps: [
      'Write both factors as a × 10ⁿ (40M = 4 × 10⁷; 3,000 = 3 × 10³).',
      'Multiply the mantissas (4 × 3 = 12).',
      'Add the exponents (7 + 3 = 10).',
      'Normalise: if the mantissa is ≥ 10, move the decimal point one place and increase n by 1 (12 × 10¹⁰ = 1.2 × 10¹¹).',
    ],
    trick: '3 × 10⁴ × 5 × 10⁵ = 15 × 10⁹ = 1.5 × 10¹⁰ → n = 10. And 40M × 3,000 = 12 × 10¹⁰ = 1.2 × 10¹¹ → n = 11.',
    pitfalls: [
      'Forgetting the mantissa carry: 15 × 10⁹ has n = 10, not 9.',
      'Multiplying the exponents instead of adding them.',
      'Miscounting a zero when translating K/M into powers.',
    ],
  },
  'mag.ratio': {
    idea: 'For quotients, divide the mantissas and subtract the exponents. If the mantissa ends up below 1, normalise downwards.',
    steps: [
      'Write numerator and denominator as a × 10ⁿ (6B = 6 × 10⁹; 2,000 = 2 × 10³).',
      'Divide the mantissas (6 ÷ 2 = 3).',
      'Subtract the exponents (9 − 3 = 6).',
      'Normalise: if the mantissa is < 1, move the decimal point right and decrease n by 1 (0.5 × 10⁻² = 5 × 10⁻³).',
    ],
    trick: '6B ÷ 2,000 = 3 × 10⁶ → n = 6. And 2 × 10³ ÷ 4 × 10⁵ = 0.5 × 10⁻² = 5 × 10⁻³ → n = −3.',
    pitfalls: [
      'Adding the exponents instead of subtracting them.',
      'Not normalising a mantissa < 1: 0.5 × 10⁻² has n = −3, not −2.',
      'Swapping the order (denominator − numerator) and getting the sign of the exponent wrong.',
    ],
  },
  'tricks.x11': {
    idea: 'Times 11 means times 10 plus times 1. With two digits this happens by itself: the digits stay on the outside, their sum goes in the middle.',
    steps: [
      'Write the two digits with a gap in between: 4 _ 7.',
      'Add the two digits and put the sum in the gap: 4 + 7 = 11.',
      'If the sum is greater than 9, write only the ones and carry the 1 to the left digit.',
      'With three digits: a | a+b | b+c | c, adding the carries from right to left.',
    ],
    trick: '47 × 11 = 4 | 4+7 | 7 → 4 | 11 | 7 → 517. With 3 digits: 234 × 11 = 2 | 2+3 | 3+4 | 4 = 2 | 5 | 7 | 4 = 2,574.',
    pitfalls: [
      'Forgetting the carry: for 4 | 11 | 7 the answer is 517, not 4117.',
      'With three digits, not adding the carries from right to left.',
    ],
  },
  'tricks.diffsq': {
    idea: 'If the two factors sit equally far left and right of a round number, the difference of squares helps: (m − d)(m + d) = m² − d².',
    steps: [
      'Find the midpoint m of the two numbers (ideally a multiple of 10).',
      'Work out the distance d from the midpoint.',
      'Square the midpoint and the distance.',
      'Subtract the small square from the large one.',
    ],
    trick: '47 × 53: midpoint 50, distance 3 → 50² − 3² = 2,500 − 9 = 2,491.',
    pitfalls: [
      'Adding instead of subtracting: m² − d², not m² + d².',
      'Getting the distance wrong – it is half the difference between the numbers, not the whole difference.',
    ],
  },
  'tricks.near100': {
    idea: 'Multiply two numbers just below 100 via their distances to 100: subtract crosswise, take times 100, add the product of the distances.',
    steps: [
      'Find the distances to 100: 97 → 3, 96 → 4.',
      'Subtract one distance crosswise from the other number: 97 − 4 = 93 (or 96 − 3).',
      'Append two zeros: 9,300.',
      'Add the product of the distances: 3 × 4 = 12 → 9,312.',
    ],
    trick: '97 × 96 = (100 − 3 − 4) · 100 + 3 · 4 = 9,300 + 12 = 9,312.',
    pitfalls: [
      'Forgetting the product of the distances.',
      'Instead of subtracting crosswise, subtracting both distances again from the wrong value.',
      'If the product of the distances is above 99, remember to add it in full (not to append it).',
    ],
  },
  'tricks.square5': {
    idea: 'Every number ending in 5 has a square ending in 25. In front goes the product of the tens number and its successor.',
    steps: [
      'Take the number without the trailing 5: 65 → 6.',
      'Multiply it by its successor: 6 × 7 = 42.',
      'Append 25: 4,225.',
    ],
    trick: '65² = 6 · 7 | 25 = 42 | 25 = 4,225. And 145² = 14 · 15 | 25 = 210 | 25 = 21,025.',
    pitfalls: [
      'Multiplying the tens number by itself instead of by its successor.',
      'Forgetting the “25” or appending only a 5.',
    ],
  },
  'tricks.pctswap': {
    idea: 'Percentages can be swapped: x% of y is the same as y% of x. Swap when the swapped percentage is round (10, 20, 25, 50).',
    steps: [
      'Check whether y is a round percentage (10, 20, 25, 50).',
      'Swap the numbers: x% of y becomes y% of x.',
      'Work out the round part: 50% = ÷ 2, 25% = ÷ 4, 20% = ÷ 5, 10% = ÷ 10.',
    ],
    trick: '8% of 50 = 50% of 8 = 4. And 36% of 25 = 25% of 36 = 9.',
    pitfalls: [
      'Swapping even though the swapped value is not rounder.',
      'Halving or quartering the wrong value (the original number instead of the swapped one).',
    ],
  },
  'tricks.subround': {
    idea: 'Never subtract a number ending in 7, 8 or 9 in one go: round it to the next ten, subtract the round number and correct.',
    steps: [
      'Round the number to subtract up to the next ten: 38 → 40 (+2).',
      'Subtract the round number: 83 − 40 = 43.',
      'Give back what you subtracted too much: 43 + 2 = 45.',
    ],
    trick: '83 − 38 = 83 − 40 + 2 = 45. And 512 − 289 = 512 − 290 + 1 = 223.',
    pitfalls: [
      'Subtracting the correction instead of adding it.',
      'Getting the distance to the ten wrong (38 → 40 is +2, not +1).',
    ],
  },
  'exhibit.share': {
    idea: 'A share is always part ÷ whole. In exhibits the whole is rarely given – you have to add it up from the bars first.',
    steps: [
      'Read the title and unit (e.g. €M) before calculating.',
      'Add up all bars to get the total.',
      'Divide the bar in question by the total.',
      'Simplify the fraction or go via known fractions (1/4 = 25%, 1/8 = 12.5%).',
    ],
    trick: '60 out of 240: 60/240 = 1/4 = 25%. 70 out of 280 is 1/4 too. Simplifying saves the division.',
    pitfalls: [
      'Dividing by the largest bar instead of the total.',
      'Missing a bar when adding up, especially with five segments.',
    ],
  },
  'exhibit.growth': {
    idea: 'Growth always refers to the start value: (end value − start value) ÷ start value. Read off the two years carefully and ignore the columns in between.',
    steps: [
      'Find the two years asked for and read off their values.',
      'Work out the difference end value − start value.',
      'Divide the difference by the start value.',
      'Convert to percent and round sensibly.',
    ],
    trick: 'From 160 to 200: difference 40, 40 ÷ 160 = 1/4 = 25%. Backwards (200 → 160) it would only be −20%.',
    pitfalls: [
      'Dividing by the end value instead of the start value.',
      'Mixing up the years or reading off a year in between.',
      'Confusing growth over several years with annual growth (CAGR).',
    ],
  },
  'exhibit.mix': {
    idea: 'A weighted average weights each value by its share. The simple mean of the prices is almost always wrong because the segments differ in size.',
    steps: [
      'Check that the shares add up to 100%.',
      'Multiply share × price per row (70% × €10 = €7).',
      'Add up the partial results.',
      'Sanity check: the result lies between the lowest and highest price, closer to the largest segment.',
    ],
    trick: '70% pay €10, 30% pay €20: 7 + 6 = €13. The simple mean (€15) is too high because most customers are on the cheap plan.',
    pitfalls: [
      'Simply averaging the prices without taking the shares into account.',
      'Not converting percentages to decimals (70 × 10 = 700 instead of 7).',
    ],
  },
  'exhibit.rel': {
    idea: 'Absolute and relative are two different questions. A large segment often adds the most in euros but grows more slowly in percent than a small one.',
    steps: [
      'Check the question: percent or absolute?',
      'Work out the increase per segment (new − old).',
      'Divide each increase by its own starting value.',
      'Compare the percentages, not the column heights.',
    ],
    trick: 'A: 200 → 230 (+30 = 15%), B: 40 → 56 (+16 = 40%). B grows almost three times as fast in percent, even though A adds more in absolute terms.',
    pitfalls: [
      'Picking the tallest column or the largest absolute increase.',
      'Dividing the increase by the new value instead of the old one.',
    ],
  },
  'custom.mul': {
    idea: 'Split the larger factor into hundreds, tens and ones, multiply each piece by the other factor and add the partial results.',
    steps: [
      'Pick the larger factor to split: 17 = 10 + 7.',
      'Multiply each piece by the other factor: 10 × 6 and 7 × 6.',
      'Add the partial products: 60 + 42 = 102.',
    ],
    trick: '17 × 6 = 10 × 6 + 7 × 6 = 60 + 42 = 102. If a number sits just below a ten, go backwards: 19 × 6 = 20 × 6 − 6 = 114.',
    pitfalls: [
      'Forgetting a piece (e.g. only multiplying the tens).',
      'Losing the zeros on the tens and hundreds parts.',
    ],
  },
  'custom.square': {
    idea: 'Work out squares close to a ten via (n − k)(n + k) + k²: the product with the neighbouring ten is easy, the rest is a small square.',
    steps: [
      'Find the nearest ten r and the distance k = |n − r|.',
      'Form the counterpart on the other side: n + k or n − k.',
      'Multiply r by the counterpart.',
      'Add k²: n² = r · (2n − r) + k².',
    ],
    trick: '13² = 10 · 16 + 3² = 160 + 9 = 169. And 18² = 20 · 16 + 2² = 320 + 4 = 324.',
    pitfalls: [
      'Forgetting k² or subtracting it instead of adding.',
      'Forming the counterpart on the wrong side (for 13 it is 16, not 10 − 3 = 7).',
    ],
  },
};
