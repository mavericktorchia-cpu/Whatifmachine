/**
 * Curated landmark trades. The NHL publishes no machine-readable trade ledger, so these are entered by hand.
 * Each side lists what that team RECEIVED. Draft picks are listed by the player eventually chosen with
 * them (`via` describes the pick), because only players carry WAR.
 * Cash, future considerations and picks that never produced an NHL player are noted in `extras`.
 */
export interface TradeAsset {
  name: string;
  via?: string;
}

export interface TradeSide {
  team: string; // abbrev at the time of the trade
  receives: TradeAsset[];
  extras?: string[];
}

export interface TradeDef {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  blurb: string;
  sides: [TradeSide, TradeSide];
  tags?: string[];
}

export const TRADES: TradeDef[] = [
  {
    id: "gretzky-1988",
    title: "The Trade: Gretzky to Los Angeles",
    date: "1988-08-09",
    blurb: "Edmonton sends the Great One south in the deal that changed hockey's map — and ended a dynasty after four Cups in five years.",
    sides: [
      { team: "EDM", receives: [{ name: "Jimmy Carson" }, { name: "Martin Gelinas" }, { name: "Martin Rucinsky", via: "1991 1st-round pick" }, { name: "Nick Stajduhar", via: "1993 1st-round pick" }], extras: ["US$15 million cash", "1989 1st-round pick (traded to New Jersey)"] },
      { team: "LAK", receives: [{ name: "Wayne Gretzky" }, { name: "Marty McSorley" }, { name: "Mike Krushelnyski" }] },
    ],
    tags: ["superstar", "dynasty"],
  },
  {
    id: "lindros-1992",
    title: "The Lindros Blockbuster",
    date: "1992-06-30",
    blurb: "Eric Lindros refuses to play in Quebec; the Nordiques get a haul (Forsberg!) that powers two Avalanche Cups.",
    sides: [
      { team: "QUE", receives: [{ name: "Peter Forsberg" }, { name: "Ron Hextall" }, { name: "Mike Ricci" }, { name: "Steve Duchesne" }, { name: "Kerry Huffman" }, { name: "Chris Simon" }, { name: "Jocelyn Thibault", via: "1993 1st-round pick" }], extras: ["US$15 million cash", "1994 1st-round pick"] },
      { team: "PHI", receives: [{ name: "Eric Lindros" }] },
    ],
    tags: ["superstar", "haul"],
  },
  {
    id: "hasek-1992",
    title: "Hasek Goes to Buffalo",
    date: "1992-08-07",
    blurb: "Chicago, set in goal with Ed Belfour, flips a backup named Dominik Hasek for Stephane Beauregard and a 4th-rounder.",
    sides: [
      { team: "CHI", receives: [{ name: "Eric Daze", via: "1993 4th-round pick" }], extras: ["Stephane Beauregard (flipped to Winnipeg before playing for Chicago)"] },
      { team: "BUF", receives: [{ name: "Dominik Hasek" }] },
    ],
    tags: ["goalie", "steal"],
  },
  {
    id: "messier-1991",
    title: "Messier to Broadway",
    date: "1991-10-04",
    blurb: "The Oilers' captain is dealt to the Rangers, who end a 54-year Cup drought three seasons later.",
    sides: [
      { team: "EDM", receives: [{ name: "Bernie Nicholls" }, { name: "Steven Rice" }, { name: "Louie DeBrusk" }, { name: "David Shaw", via: "completed the deal (Beukeboom swap)" }] },
      { team: "NYR", receives: [{ name: "Mark Messier" }, { name: "Jeff Beukeboom", via: "future considerations" }] },
    ],
    tags: ["superstar", "dynasty"],
  },
  {
    id: "hull-1988",
    title: "Brett Hull Leaves Calgary",
    date: "1988-03-07",
    blurb: "Calgary trades a young sniper for defensive help and wins the Cup a year later — while Hull scores 86 goals in St. Louis.",
    sides: [
      { team: "CGY", receives: [{ name: "Rob Ramage" }, { name: "Rick Wamsley" }] },
      { team: "STL", receives: [{ name: "Brett Hull" }, { name: "Steve Bozek" }] },
    ],
    tags: ["superstar"],
  },
  {
    id: "pronger-shanahan-1995",
    title: "Pronger for Shanahan",
    date: "1995-07-27",
    blurb: "Hartford flips its franchise defenceman for Brendan Shanahan, who forces his way to Detroit a year later.",
    sides: [
      { team: "HFD", receives: [{ name: "Brendan Shanahan" }] },
      { team: "STL", receives: [{ name: "Chris Pronger" }] },
    ],
  },
  {
    id: "roy-1995",
    title: "Patrick Roy Demands Out",
    date: "1995-12-06",
    blurb: "After nine goals in a blowout, Roy tells the Canadiens' president he's done. Colorado wins the Cup that spring.",
    sides: [
      { team: "MTL", receives: [{ name: "Jocelyn Thibault" }, { name: "Martin Rucinsky" }, { name: "Andrei Kovalenko" }] },
      { team: "COL", receives: [{ name: "Patrick Roy" }, { name: "Mike Keane" }] },
    ],
    tags: ["goalie", "superstar"],
  },
  {
    id: "iginla-1995",
    title: "Nieuwendyk for a Kid Named Iginla",
    date: "1995-12-19",
    blurb: "Calgary trades its holdout captain to Dallas (Cup in 1999) for an unproven junior who becomes the Flames' greatest player.",
    sides: [
      { team: "CGY", receives: [{ name: "Jarome Iginla" }, { name: "Corey Millen" }] },
      { team: "DAL", receives: [{ name: "Joe Nieuwendyk" }] },
    ],
    tags: ["prospect"],
  },
  {
    id: "jagr-2001",
    title: "Jagr to Washington",
    date: "2001-07-11",
    blurb: "Cash-strapped Pittsburgh moves the reigning scoring champion for three prospects who play 300 NHL games combined.",
    sides: [
      { team: "PIT", receives: [{ name: "Kris Beech" }, { name: "Michal Sivek" }, { name: "Ross Lupaschuk" }] },
      { team: "WSH", receives: [{ name: "Jaromir Jagr" }, { name: "Frantisek Kucera" }] },
    ],
    tags: ["superstar"],
  },
  {
    id: "thornton-2005",
    title: "Jumbo Joe to San Jose",
    date: "2005-11-30",
    blurb: "Boston trades its captain mid-season; Thornton wins the Hart Trophy months later as a Shark.",
    sides: [
      { team: "BOS", receives: [{ name: "Marco Sturm" }, { name: "Wayne Primeau" }, { name: "Brad Stuart" }] },
      { team: "SJS", receives: [{ name: "Joe Thornton" }] },
    ],
    tags: ["superstar", "cap era"],
  },
  {
    id: "luongo-2006",
    title: "Luongo for Bertuzzi",
    date: "2006-06-23",
    blurb: "Florida ships an elite goalie to Vancouver for a power forward who plays seven games for the Panthers.",
    sides: [
      { team: "FLA", receives: [{ name: "Todd Bertuzzi" }, { name: "Bryan Allen" }, { name: "Alex Auld" }] },
      { team: "VAN", receives: [{ name: "Roberto Luongo" }, { name: "Lukas Krajicek" }] },
    ],
    tags: ["goalie", "cap era"],
  },
  {
    id: "kessel-2009",
    title: "Kessel to Toronto",
    date: "2009-09-18",
    blurb: "Toronto gives up two firsts and a second for Phil Kessel. The picks become Tyler Seguin and Dougie Hamilton.",
    sides: [
      { team: "BOS", receives: [{ name: "Tyler Seguin", via: "2010 1st-round pick (#2)" }, { name: "Dougie Hamilton", via: "2011 1st-round pick (#9)" }], extras: ["2010 2nd-round pick (Jared Knight, never played in the NHL)"] },
      { team: "TOR", receives: [{ name: "Phil Kessel" }] },
    ],
    tags: ["picks", "cap era"],
  },
  {
    id: "nash-2012",
    title: "Rick Nash to the Rangers",
    date: "2012-07-23",
    blurb: "Columbus moves its first-ever star for a package of depth forwards, a prospect and a 1st.",
    sides: [
      { team: "CBJ", receives: [{ name: "Brandon Dubinsky" }, { name: "Artem Anisimov" }, { name: "Tim Erixon" }, { name: "Kerby Rychel", via: "2013 1st-round pick" }] },
      { team: "NYR", receives: [{ name: "Rick Nash" }], extras: ["Steven Delisle (never played in the NHL)", "conditional 3rd-round pick"] },
    ],
    tags: ["cap era"],
  },
  {
    id: "forsberg-2013",
    title: "Forsberg for Erat",
    date: "2013-04-03",
    blurb: "Washington trades its top prospect for a 32-year-old winger at the deadline. Forsberg becomes Nashville's all-time leading goal scorer.",
    sides: [
      { team: "WSH", receives: [{ name: "Martin Erat" }, { name: "Michael Latta" }] },
      { team: "NSH", receives: [{ name: "Filip Forsberg" }] },
    ],
    tags: ["prospect", "steal", "cap era"],
  },
  {
    id: "schneider-2013",
    title: "Schneider for the 9th Pick",
    date: "2013-06-30",
    blurb: "Vancouver deals its goalie of the future on draft day; New Jersey's pick becomes long-time Canucks captain Bo Horvat.",
    sides: [
      { team: "VAN", receives: [{ name: "Bo Horvat", via: "2013 1st-round pick (#9)" }] },
      { team: "NJD", receives: [{ name: "Cory Schneider" }] },
    ],
    tags: ["goalie", "picks", "cap era"],
  },
  {
    id: "seguin-2013",
    title: "Seguin to Dallas",
    date: "2013-07-04",
    blurb: "Boston gives up on the No. 2 pick after three seasons. Seguin scores 37 goals in his first year as a Star.",
    sides: [
      { team: "BOS", receives: [{ name: "Loui Eriksson" }, { name: "Reilly Smith" }, { name: "Matt Fraser" }, { name: "Joe Morrow" }] },
      { team: "DAL", receives: [{ name: "Tyler Seguin" }, { name: "Rich Peverley" }], extras: ["Ryan Button (never played in the NHL)"] },
    ],
    tags: ["superstar", "cap era"],
  },
  {
    id: "johansen-jones-2016",
    title: "Johansen for Seth Jones",
    date: "2016-01-06",
    blurb: "A rare one-for-one hockey trade: a No. 1 centre for a No. 1 defenceman.",
    sides: [
      { team: "CBJ", receives: [{ name: "Seth Jones" }] },
      { team: "NSH", receives: [{ name: "Ryan Johansen" }] },
    ],
    tags: ["one-for-one", "cap era"],
  },
  {
    id: "hall-larsson-2016",
    title: "Hall for Larsson",
    date: "2016-06-29",
    blurb: "\"One for one.\" Edmonton trades a former No. 1 pick for a shutdown defenceman; Hall wins the Hart Trophy in New Jersey two years later.",
    sides: [
      { team: "EDM", receives: [{ name: "Adam Larsson" }] },
      { team: "NJD", receives: [{ name: "Taylor Hall" }] },
    ],
    tags: ["one-for-one", "cap era"],
  },
  {
    id: "subban-weber-2016",
    title: "Subban for Weber",
    date: "2016-06-29",
    blurb: "Montreal and Nashville swap star defencemen 37 minutes after Hall-for-Larsson. Subban helps the Predators reach the 2017 Final.",
    sides: [
      { team: "MTL", receives: [{ name: "Shea Weber" }] },
      { team: "NSH", receives: [{ name: "P.K. Subban" }] },
    ],
    tags: ["one-for-one", "cap era"],
  },
  {
    id: "drouin-sergachev-2017",
    title: "Drouin for Sergachev",
    date: "2017-06-15",
    blurb: "Tampa Bay lands a teenage defenceman who becomes a key piece of back-to-back Cups.",
    sides: [
      { team: "MTL", receives: [{ name: "Jonathan Drouin" }] },
      { team: "TBL", receives: [{ name: "Mikhail Sergachev" }] },
    ],
    tags: ["prospect", "cap era"],
  },
  {
    id: "karlsson-2018",
    title: "Karlsson to San Jose",
    date: "2018-09-13",
    blurb: "Ottawa trades its two-time Norris winner; San Jose's 2020 1st turns into the 3rd overall pick, Tim Stutzle.",
    sides: [
      { team: "OTT", receives: [{ name: "Chris Tierney" }, { name: "Dylan DeMelo" }, { name: "Josh Norris" }, { name: "Rudolfs Balcers" }, { name: "Tim Stutzle", via: "2020 1st-round pick (#3)" }], extras: ["2019 2nd-round pick", "conditional picks"] },
      { team: "SJS", receives: [{ name: "Erik Karlsson" }], extras: ["Francis Perron (no games for San Jose)"] },
    ],
    tags: ["superstar", "picks", "cap era"],
  },
  {
    id: "eichel-2021",
    title: "Eichel to Vegas",
    date: "2021-11-04",
    blurb: "After a neck-surgery standoff, Buffalo sends its captain to Vegas — who win the Cup in 2023.",
    sides: [
      { team: "BUF", receives: [{ name: "Alex Tuch" }, { name: "Peyton Krebs" }, { name: "Noah Ostlund", via: "2022 1st-round pick" }], extras: ["2023 2nd-round pick"] },
      { team: "VGK", receives: [{ name: "Jack Eichel" }], extras: ["2023 3rd-round pick"] },
    ],
    tags: ["superstar", "cap era"],
  },
  {
    id: "tkachuk-2022",
    title: "Tkachuk for Huberdeau",
    date: "2022-07-22",
    blurb: "Florida trades a 115-point winger for Matthew Tkachuk, then wins back-to-back Cups.",
    sides: [
      { team: "CGY", receives: [{ name: "Jonathan Huberdeau" }, { name: "MacKenzie Weegar" }, { name: "Cole Schwindt" }], extras: ["2025 1st-round pick"] },
      { team: "FLA", receives: [{ name: "Matthew Tkachuk" }], extras: ["2025 4th-round pick"] },
    ],
    tags: ["superstar", "cap era"],
  },
];

/**
 * Approximate cap hits (AAV, millions USD) for players in the curated trades, from public contract
 * reporting. Anyone not listed gets a modelled estimate (see engine/cap.ts).
 * [firstSeason, lastSeason, aav]
 */
export const CONTRACTS: Record<string, [number, number, number][]> = {
  "Joe Thornton": [[20052006, 20052006, 6.67], [20062007, 20072008, 6.6], [20082009, 20132014, 7.2], [20142015, 20162017, 6.75]],
  "Marco Sturm": [[20052006, 20062007, 2.0], [20072008, 20092010, 3.5]],
  "Brad Stuart": [[20052006, 20072008, 3.5]],
  "Roberto Luongo": [[20062007, 20092010, 6.5], [20102011, 20212022, 5.333]],
  "Todd Bertuzzi": [[20052006, 20062007, 5.2]],
  "Phil Kessel": [[20092010, 20132014, 5.4], [20142015, 20212022, 8.0]],
  "Tyler Seguin": [[20102011, 20122013, 1.2], [20132014, 20182019, 5.75], [20192020, 20262027, 9.85]],
  "Dougie Hamilton": [[20132014, 20142015, 1.2], [20152016, 20202021, 5.75], [20212022, 20272028, 9.0]],
  "Loui Eriksson": [[20132014, 20152016, 4.25], [20162017, 20212022, 6.0]],
  "Reilly Smith": [[20132014, 20132014, 0.9], [20142015, 20142015, 1.4], [20152016, 20152016, 3.425], [20162017, 20222023, 5.0]],
  "Rick Nash": [[20092010, 20172018, 7.8]],
  "Brandon Dubinsky": [[20122013, 20142015, 4.2], [20152016, 20202021, 5.85]],
  "Artem Anisimov": [[20122013, 20142015, 1.875], [20152016, 20192020, 4.55]],
  "Filip Forsberg": [[20142015, 20152016, 0.89], [20162017, 20212022, 6.0], [20222023, 20292030, 8.5]],
  "Martin Erat": [[20122013, 20132014, 4.5]],
  "Cory Schneider": [[20132014, 20132014, 4.0], [20142015, 20212022, 6.0]],
  "Bo Horvat": [[20142015, 20162017, 0.894], [20172018, 20222023, 5.5], [20232024, 20302031, 8.5]],
  "Seth Jones": [[20152016, 20152016, 0.894], [20162017, 20212022, 5.4], [20222023, 20292030, 9.5]],
  "Ryan Johansen": [[20152016, 20162017, 4.0], [20172018, 20242025, 8.0]],
  "Taylor Hall": [[20102011, 20122013, 0.9], [20132014, 20192020, 6.0]],
  "Adam Larsson": [[20142015, 20192020, 4.167], [20202021, 20202021, 4.0]],
  "P.K. Subban": [[20142015, 20212022, 9.0]],
  "Shea Weber": [[20122013, 20252026, 7.857]],
  "Jonathan Drouin": [[20172018, 20222023, 5.5]],
  "Mikhail Sergachev": [[20172018, 20192020, 0.925], [20202021, 20212022, 4.8], [20222023, 20302031, 8.5]],
  "Erik Karlsson": [[20122013, 20182019, 6.5], [20192020, 20262027, 11.5]],
  "Josh Norris": [[20202021, 20212022, 0.925], [20222023, 20292030, 7.95]],
  "Tim Stutzle": [[20202021, 20222023, 0.925], [20232024, 20302031, 8.35]],
  "Jack Eichel": [[20152016, 20172018, 0.925], [20182019, 20252026, 10.0]],
  "Alex Tuch": [[20192020, 20252026, 4.75]],
  "Peyton Krebs": [[20212022, 20232024, 0.863]],
  "Matthew Tkachuk": [[20162017, 20182019, 0.925], [20192020, 20212022, 7.0], [20222023, 20292030, 9.5]],
  "Jonathan Huberdeau": [[20182019, 20222023, 5.9], [20232024, 20302031, 10.5]],
  "MacKenzie Weegar": [[20202021, 20222023, 3.25], [20232024, 20302031, 6.25]],
};
