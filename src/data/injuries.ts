/**
 * Career-altering injuries and illnesses. `from`–`to` is the window the healthy projection covers;
 * `team` (optional) keeps the player with one club for that window (Orr stays a Bruin).
 */
export interface InjuryPreset {
  id: string;
  player: string;
  title: string;
  blurb: string;
  from: number;
  to: number;
  team?: string;
}

export const INJURIES: InjuryPreset[] = [
  {
    id: "orr-knees",
    player: "Bobby Orr",
    title: "Bobby Orr's knees",
    blurb: "Six knee operations ended the greatest defenceman's prime at 27. Healthy, he'd have stayed a Bruin through his mid-thirties.",
    from: 19751976,
    to: 19831984,
    team: "BOS",
  },
  {
    id: "lemieux-health",
    player: "Mario Lemieux",
    title: "A healthy Mario Lemieux",
    blurb: "Back surgery, Hodgkin's lymphoma and a three-season retirement cost Lemieux roughly 600 games.",
    from: 19901991,
    to: 20052006,
    team: "PIT",
  },
  {
    id: "bossy-back",
    player: "Mike Bossy",
    title: "Mike Bossy's back",
    blurb: "Nine straight 50-goal seasons, then a back injury retired him at 30.",
    from: 19861987,
    to: 19911992,
    team: "NYI",
  },
  {
    id: "neely-hip",
    player: "Cam Neely",
    title: "Cam Neely after the Samuelsson hit",
    blurb: "A 1991 playoff knee-on-thigh hit led to myositis ossificans; Neely played only 93 more games over three seasons and retired at 31.",
    from: 19911992,
    to: 19981999,
    team: "BOS",
  },
  {
    id: "lafontaine-concussions",
    player: "Pat LaFontaine",
    title: "Pat LaFontaine's concussions",
    blurb: "A 148-point season in 1992-93, then knee and concussion problems ended his career at 33.",
    from: 19931994,
    to: 19992000,
  },
  {
    id: "bure-knees",
    player: "Pavel Bure",
    title: "Pavel Bure's knees",
    blurb: "The Russian Rocket led the league in goals three times, but knee injuries ended his career at 32.",
    from: 19951996,
    to: 20052006,
  },
  {
    id: "lindros-concussions",
    player: "Eric Lindros",
    title: "Eric Lindros's concussions",
    blurb: "Eight concussions turned a Hart Trophy winner into a part-time player before he turned 30.",
    from: 19971998,
    to: 20062007,
  },
  {
    id: "kariya-concussion",
    player: "Paul Kariya",
    title: "Paul Kariya, 1998",
    blurb: "A cross-check to the face in February 1998 cost Kariya the rest of the season and the Nagano Olympics.",
    from: 19971998,
    to: 19971998,
    team: "ANA",
  },
  {
    id: "forsberg-foot",
    player: "Peter Forsberg",
    title: "Peter Forsberg's feet",
    blurb: "Foot and ankle problems kept one of the best two-way centres in history to 116 games after age 31.",
    from: 20012002,
    to: 20092010,
  },
  {
    id: "crosby-concussion",
    player: "Sidney Crosby",
    title: "Crosby's 2011 concussion",
    blurb: "Crosby was running away with the 2010-11 scoring race when back-to-back hits cost him most of two seasons.",
    from: 20102011,
    to: 20112012,
    team: "PIT",
  },
  {
    id: "savard-concussion",
    player: "Marc Savard",
    title: "Marc Savard's concussions",
    blurb: "Matt Cooke's blindside hit in 2010 and a second concussion ended Savard's career at 33.",
    from: 20092010,
    to: 20142015,
    team: "BOS",
  },
];
