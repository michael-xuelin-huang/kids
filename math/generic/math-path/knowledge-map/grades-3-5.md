# Knowledge map: grades 3 to 5

77 skills in 5 worlds, generated from `source-grades-3-5.txt` by `tools/build-map.mjs`. Grade 2 rows are the floor the map assumes. "Depth" is the number of prerequisite steps below a skill: anything at depth 0 can be learned first.

## Pattern Jungle (operations and algebraic thinking)

| Skill | Grade | Standard | Depth | Needs | Games |
|---|---|---|---|---|---|
| Add and subtract within 20 from memory (`oa2-addsub-20`) ✓ in Pingo | 2 | 2.OA.B.2 | 0 | – | fact-drill |
| Multiplication as equal groups and arrays (`oa3-mult-meaning`) | 3 | 3.OA.A.1 | 1 | `oa2-addsub-20` | choice, area-model |
| Division as sharing and as grouping (`oa3-div-meaning`) | 3 | 3.OA.A.2 | 2 | `oa3-mult-meaning` | choice, area-model |
| Use commutative, associative and distributive properties to multiply (`oa3-properties`) | 3 | 3.OA.B.5 | 2 | `oa3-mult-meaning` | area-model, explain |
| One-step multiplication and division word problems within 100 (`oa3-word-problems`) | 3 | 3.OA.A.3 | 3 | `oa3-mult-meaning`, `oa3-div-meaning` | story-problem |
| Find the unknown number in a multiplication or division equation (`oa3-unknown-factor`) | 3 | 3.OA.A.4, 3.OA.B.6 | 3 | `oa3-div-meaning` | keypad |
| Times tables from memory (1 x 1 to 9 x 9) (`oa3-facts-mult`) ✓ in Pingo | 3 | 3.OA.C.7 | 3 | `oa3-mult-meaning`, `oa3-properties` | fact-drill |
| Two-step word problems with the four operations; check if an answer is reasonable (`oa3-two-step`) | 3 | 3.OA.D.8 | 4 | `oa3-word-problems`, `nbt3-addsub-1000` | story-problem, explain |
| Division facts from memory (`oa3-facts-div`) ✓ in Pingo | 3 | 3.OA.C.7 | 4 | `oa3-facts-mult`, `oa3-unknown-factor` | fact-drill |
| Find and explain patterns in addition and multiplication tables (`oa3-patterns`) | 3 | 3.OA.D.9 | 4 | `oa3-facts-mult` | choice, explain |
| Multiplicative comparison ("three times as many as") (`oa4-mult-compare`) | 4 | 4.OA.A.1, 4.OA.A.2 | 4 | `oa3-word-problems` | story-problem |
| Factor pairs, multiples, prime and composite numbers to 100 (`oa4-factors-multiples`) | 4 | 4.OA.B.4 | 5 | `oa3-facts-div` | choice, keypad |
| Generate a number or shape pattern from a rule and describe it (`oa4-patterns`) | 4 | 4.OA.C.5 | 5 | `oa3-patterns` | choice, explain |
| Multistep word problems, including interpreting remainders (`oa4-multistep`) | 4 | 4.OA.A.3 | 6 | `oa3-two-step`, `nbt4-div-1digit` | story-problem, explain |
| Two numerical patterns, ordered pairs, graph them (`oa5-two-patterns`) | 5 | 5.OA.B.3 | 6 | `oa4-patterns`, `g5-coordinate` | coordinate-grid |
| Evaluate expressions with parentheses, brackets and braces (`oa5-expressions`) | 5 | 5.OA.A.1 | 7 | `oa4-multistep` | keypad |
| Write and interpret expressions without evaluating them (`oa5-write-expressions`) | 5 | 5.OA.A.2 | 8 | `oa5-expressions` | choice, explain |

## Number Ice Fields (place value and multi-digit operations)

| Skill | Grade | Standard | Depth | Needs | Games |
|---|---|---|---|---|---|
| Add and subtract within 100 (`nbt2-addsub-100`) ✓ in Pingo | 2 | 2.NBT.B.5 | 0 | – | fact-drill, keypad |
| Round to the nearest 10 or 100 (`nbt3-round`) | 3 | 3.NBT.A.1 | 1 | `nbt2-addsub-100` | number-line, choice |
| Add and subtract within 1000 (`nbt3-addsub-1000`) | 3 | 3.NBT.A.2 | 1 | `nbt2-addsub-100` | base-ten, keypad |
| Place value to 1,000,000: each place is ten times the place to its right (`nbt4-place-value`) | 4 | 4.NBT.A.1 | 2 | `nbt3-addsub-1000` | base-ten, choice |
| Read, write and compare multi-digit numbers (`nbt4-read-compare`) | 4 | 4.NBT.A.2 | 3 | `nbt4-place-value` | choice, keypad |
| Round multi-digit numbers to any place (`nbt4-round`) | 4 | 4.NBT.A.3 | 3 | `nbt3-round`, `nbt4-place-value` | number-line, keypad |
| Add and subtract multi-digit numbers with the standard algorithm (`nbt4-addsub-algorithm`) | 4 | 4.NBT.B.4 | 3 | `nbt3-addsub-1000`, `nbt4-place-value` | long-algorithm, keypad |
| Multiply one-digit numbers by multiples of 10 (9 x 80) (`nbt3-mult-10s`) | 3 | 3.NBT.A.3 | 4 | `oa3-facts-mult` | keypad |
| Divide up to 4-digit by 1-digit, with remainders (`nbt4-div-1digit`) | 4 | 4.NBT.B.6 | 5 | `oa3-facts-div`, `nbt4-place-value` | long-division, area-model |
| Multiply up to 4-digit by 1-digit (`nbt4-mult-4x1`) | 4 | 4.NBT.B.5 | 5 | `oa3-facts-mult`, `nbt3-mult-10s`, `oa3-properties` | area-model, keypad |
| Multiply two 2-digit numbers (`nbt4-mult-2x2`) | 4 | 4.NBT.B.5 | 6 | `nbt4-mult-4x1` | area-model, keypad |
| Multi-digit multiplication with the standard algorithm (`nbt5-mult-algorithm`) | 5 | 5.NBT.B.5 | 7 | `nbt4-mult-2x2` | long-algorithm, keypad |
| Divide up to 4-digit by 2-digit divisors (`nbt5-div-2digit`) | 5 | 5.NBT.B.6 | 7 | `nbt4-div-1digit`, `nbt4-mult-2x2` | long-division, area-model |
| Place value to thousandths; multiplying and dividing by powers of 10 (`nbt5-place-value-decimals`) | 5 | 5.NBT.A.1, 5.NBT.A.2 | 10 | `nbt4-place-value`, `nf4-decimal-notation` | base-ten, choice |
| Read, write and compare decimals to thousandths (`nbt5-decimal-compare`) | 5 | 5.NBT.A.3 | 11 | `nbt5-place-value-decimals` | number-line, choice |
| Add and subtract decimals to hundredths (`nbt5-decimal-addsub`) | 5 | 5.NBT.B.7 | 11 | `nbt5-place-value-decimals`, `nbt4-addsub-algorithm` | base-ten, keypad |
| Round decimals to any place (`nbt5-decimal-round`) | 5 | 5.NBT.A.4 | 12 | `nbt5-decimal-compare`, `nbt4-round` | number-line, keypad |
| Multiply and divide decimals to hundredths (`nbt5-decimal-multdiv`) | 5 | 5.NBT.B.7 | 12 | `nbt5-decimal-addsub`, `nbt5-mult-algorithm`, `nbt5-div-2digit` | area-model, keypad |

## Fraction Reef (fractions and decimals)

| Skill | Grade | Standard | Depth | Needs | Games |
|---|---|---|---|---|---|
| Unit fraction 1/b: one of b equal parts (`nf3-unit-fraction`) | 3 | 3.NF.A.1 | 3 | `oa3-div-meaning` | fraction-bars, choice |
| Fraction a/b: a parts of size 1/b (`nf3-fraction-a-b`) | 3 | 3.NF.A.1 | 4 | `nf3-unit-fraction` | fraction-bars, choice |
| Fractions on a number line (`nf3-number-line`) | 3 | 3.NF.A.2 | 5 | `nf3-fraction-a-b` | number-line |
| Decompose a fraction into a sum of fractions (`nf4-decompose`) | 4 | 4.NF.B.3a, 4.NF.B.3b | 5 | `nf3-fraction-a-b` | fraction-bars |
| Simple equivalent fractions, shown with models (`nf3-equivalent-simple`) | 3 | 3.NF.A.3a, 3.NF.A.3b | 6 | `nf3-number-line` | fraction-bars, number-line |
| Whole numbers as fractions (3 = 3/1, 1 = 4/4) (`nf3-whole-as-fraction`) | 3 | 3.NF.A.3c | 6 | `nf3-number-line` | number-line, choice |
| Add and subtract fractions with like denominators (`nf4-addsub-like`) | 4 | 4.NF.B.3a, 4.NF.B.3d | 6 | `nf4-decompose` | fraction-bars, keypad |
| Compare fractions with the same numerator or the same denominator (`nf3-compare`) | 3 | 3.NF.A.3d | 7 | `nf3-equivalent-simple` | fraction-bars, choice, explain |
| Equivalent fractions by multiplying by n/n (`nf4-equivalent`) | 4 | 4.NF.A.1 | 7 | `nf3-equivalent-simple`, `oa3-facts-mult` | fraction-bars, keypad |
| Mixed numbers: convert, add and subtract (`nf4-mixed`) | 4 | 4.NF.B.3c | 7 | `nf4-addsub-like`, `nf3-whole-as-fraction` | fraction-bars, keypad |
| Multiply a fraction by a whole number (`nf4-frac-times-whole`) | 4 | 4.NF.B.4 | 7 | `nf4-addsub-like`, `oa3-facts-mult` | fraction-bars, keypad |
| Compare fractions with different numerators and denominators (`nf4-compare`) | 4 | 4.NF.A.2 | 8 | `nf4-equivalent`, `nf3-compare` | number-line, choice, explain |
| Tenths and hundredths: 3/10 = 30/100 (`nf4-tenths-hundredths`) | 4 | 4.NF.C.5 | 8 | `nf4-equivalent` | base-ten, fraction-bars |
| Add and subtract fractions with unlike denominators (`nf5-addsub-unlike`) | 5 | 5.NF.A.1, 5.NF.A.2 | 8 | `nf4-addsub-like`, `nf4-equivalent`, `oa4-factors-multiples` | fraction-bars, keypad |
| A fraction as division: 3/4 = 3 / 4 (`nf5-fraction-as-division`) | 5 | 5.NF.B.3 | 8 | `nf4-frac-times-whole`, `oa3-div-meaning` | fraction-bars, story-problem |
| Multiply fractions, including area of rectangles with fraction sides (`nf5-multiply`) | 5 | 5.NF.B.4 | 8 | `nf4-frac-times-whole`, `md3-area-multiply` | area-model, keypad |
| Decimal notation for tenths and hundredths (`nf4-decimal-notation`) | 4 | 4.NF.C.6 | 9 | `nf4-tenths-hundredths` | number-line, choice |
| Multiplication as scaling: when is the product bigger or smaller (`nf5-scaling`) | 5 | 5.NF.B.5 | 9 | `nf5-multiply` | choice, explain |
| Divide unit fractions by whole numbers and whole numbers by unit fractions (`nf5-divide-unit`) | 5 | 5.NF.B.7 | 9 | `nf5-fraction-as-division`, `nf5-multiply` | fraction-bars, story-problem |
| Compare decimals to hundredths (`nf4-decimal-compare`) | 4 | 4.NF.C.7 | 10 | `nf4-decimal-notation` | number-line, choice |
| Real-world problems multiplying fractions and mixed numbers (`nf5-mult-word`) | 5 | 5.NF.B.6 | 10 | `nf5-scaling`, `nf4-mixed` | story-problem |

## Shape Savanna (measurement and geometry)

| Skill | Grade | Standard | Depth | Needs | Games |
|---|---|---|---|---|---|
| Categories of shapes; quadrilaterals (`g3-shapes`) | 3 | 3.G.A.1 | 0 | – | choice |
| Tell time to the minute; elapsed time (`md3-time`) | 3 | 3.MD.A.1 | 1 | `nbt2-addsub-100` | clock, number-line |
| Points, lines, rays, angle types; parallel and perpendicular (`g4-lines-angles`) | 4 | 4.G.A.1, 4.G.A.2 | 1 | `g3-shapes` | choice |
| Lines of symmetry (`g4-symmetry`) | 4 | 4.G.A.3 | 1 | `g3-shapes` | choice |
| Liquid volume and mass in grams, kilograms and liters (`md3-mass-volume`) | 3 | 3.MD.A.2 | 2 | `nbt3-addsub-1000` | choice, story-problem |
| Area as the number of unit squares (`md3-area-concept`) | 3 | 3.MD.C.5, 3.MD.C.6 | 2 | `oa3-mult-meaning` | area-model |
| Measure angles in degrees; add angles (`md4-angles`) | 4 | 4.MD.C.5, 4.MD.C.6, 4.MD.C.7 | 2 | `g4-lines-angles`, `nbt3-addsub-1000` | protractor, keypad |
| The coordinate plane (first quadrant) (`g5-coordinate`) | 5 | 5.G.A.1, 5.G.A.2 | 2 | `nbt3-addsub-1000` | coordinate-grid |
| Classify 2D figures in a hierarchy (`g5-classify`) | 5 | 5.G.B.3, 5.G.B.4 | 2 | `g3-shapes`, `g4-lines-angles` | choice, explain |
| Perimeter; same area with different perimeters (`md3-perimeter`) | 3 | 3.MD.D.8 | 3 | `md3-area-concept`, `nbt3-addsub-1000` | area-model, keypad |
| Partition shapes into equal areas, as unit fractions (`g3-partition`) | 3 | 3.G.A.2 | 4 | `nf3-unit-fraction`, `md3-area-concept` | area-model |
| Area by multiplying side lengths; splitting rectangles (distributive) (`md3-area-multiply`) | 3 | 3.MD.C.7 | 4 | `md3-area-concept`, `oa3-facts-mult`, `oa3-properties` | area-model, keypad |
| Area and perimeter formulas for rectangles (`md4-area-perimeter-formulas`) | 4 | 4.MD.A.3 | 5 | `md3-area-multiply`, `md3-perimeter` | keypad, story-problem |
| Volume as unit cubes (`md5-volume-concept`) | 5 | 5.MD.C.3, 5.MD.C.4 | 5 | `md3-area-multiply` | area-model |
| Volume of rectangular prisms: l x w x h; adding volumes (`md5-volume-formula`) | 5 | 5.MD.C.5 | 7 | `md5-volume-concept`, `nbt4-mult-2x2` | keypad, story-problem |
| Convert measurement units; measurement word problems (`md4-units-convert`) | 4 | 4.MD.A.1, 4.MD.A.2 | 10 | `oa3-facts-mult`, `nf4-decimal-notation` | story-problem, keypad |
| Convert units within one system (cm to m, decimals) (`md5-convert`) | 5 | 5.MD.A.1 | 11 | `md4-units-convert`, `nbt5-place-value-decimals` | keypad |

## Data Observatory (data)

| Skill | Grade | Standard | Depth | Needs | Games |
|---|---|---|---|---|---|
| Scaled picture graphs and bar graphs (`md3-graphs`) | 3 | 3.MD.B.3 | 2 | `nbt2-addsub-100`, `oa3-mult-meaning` | graph-builder |
| Line plots of measurements in halves and quarters (`md3-line-plot`) | 3 | 3.MD.B.4 | 6 | `nf3-number-line`, `md3-graphs` | graph-builder |
| Line plots of fractional measurements; add and subtract to solve (`md4-line-plot-fractions`) | 4 | 4.MD.B.4 | 7 | `md3-line-plot`, `nf4-addsub-like` | graph-builder |
| Line plots and sharing totals equally (`md5-line-plot`) | 5 | 5.MD.B.2 | 9 | `md4-line-plot-fractions`, `nf5-multiply` | graph-builder, explain |

## Game templates

| Template | What it is |
|---|---|
| `fact-drill` | Fast recall with spaced repeats (voice, keypad or choice) — Pingo today |
| `choice` | Tap one of 3 to 4 options; wrong options come from misconceptions |
| `keypad` | Type a number, fraction or decimal; equivalent forms accepted |
| `story-problem` | Short story problem from an NPC; keypad or choice answer, optional "why" |
| `explain` | Explain why / find Pingo's mistake; free text, typed or dictated, AI-scored later |
| `fraction-bars` | Cut, shade and compare fraction bars |
| `number-line` | Place or read a number or fraction on a number line |
| `area-model` | Arrays and area rectangles: build, split, count |
| `base-ten` | Base-ten blocks: bundle and unbundle tens, hundreds, tenths |
| `long-algorithm` | Column addition, subtraction and multiplication, one checked step at a time |
| `long-division` | Long division, one checked step at a time |
| `clock` | Set and read an analog clock; elapsed time on a time line |
| `protractor` | Measure and build angles |
| `coordinate-grid` | Plot and read points in the first quadrant |
| `graph-builder` | Build and read picture graphs, bar graphs and line plots |
