/**
 * ESPN summary?event={id} fixtures, trimmed to the scoringPlays array we read.
 *
 * Note what is NOT here: the `videos` array from the real response. We read
 * highlight metadata only and never touch those streams — they're DRM/geo
 * restricted and not ours to serve.
 *
 * The mock plays handler reveals these progressively (one new play roughly
 * every 45s of wall clock) so the score-card interstitial path is testable
 * without waiting for a real touchdown.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export const MOCK_SUMMARIES: Record<string, any> = {
  // Georgia at Alabama — the favorite in-progress game.
  '401628301': {
    header: { id: '401628301' },
    scoringPlays: [
      {
        id: '4016283011',
        sequenceNumber: '1',
        type: { id: '68', text: 'Passing Touchdown', abbreviation: 'TD' },
        scoringType: { name: 'touchdown', abbreviation: 'TD' },
        text: 'Gunner Stockton pass complete to Arian Smith for 34 yds for a TD, Peyton Woodring extra point is GOOD',
        period: { number: 1 },
        clock: { displayValue: '9:41' },
        team: { id: '61' },
        awayScore: 7, homeScore: 0,
        wallclock: '2025-11-08T20:19:00Z',
      },
      {
        id: '4016283012',
        sequenceNumber: '2',
        type: { id: '59', text: 'Field Goal Good', abbreviation: 'FG' },
        scoringType: { name: 'field-goal', abbreviation: 'FG' },
        text: 'Conor Talty 41 yd Field Goal GOOD',
        period: { number: 2 },
        clock: { displayValue: '12:05' },
        team: { id: '333' },
        awayScore: 7, homeScore: 3,
        wallclock: '2025-11-08T20:52:00Z',
      },
      {
        id: '4016283013',
        sequenceNumber: '3',
        type: { id: '67', text: 'Rushing Touchdown', abbreviation: 'TD' },
        scoringType: { name: 'touchdown', abbreviation: 'TD' },
        text: 'Jam Miller 3 yd rush for a TD, Conor Talty extra point is GOOD',
        period: { number: 2 },
        clock: { displayValue: '3:18' },
        team: { id: '333' },
        awayScore: 7, homeScore: 10,
        wallclock: '2025-11-08T21:14:00Z',
      },
      {
        id: '4016283014',
        sequenceNumber: '4',
        type: { id: '68', text: 'Passing Touchdown', abbreviation: 'TD' },
        scoringType: { name: 'touchdown', abbreviation: 'TD' },
        text: 'Gunner Stockton pass complete to Oscar Delp for 12 yds for a TD, Peyton Woodring extra point is GOOD',
        period: { number: 3 },
        clock: { displayValue: '11:52' },
        team: { id: '61' },
        awayScore: 14, homeScore: 10,
        wallclock: '2025-11-08T21:48:00Z',
      },
      {
        id: '4016283015',
        sequenceNumber: '5',
        type: { id: '26', text: 'Interception Return Touchdown', abbreviation: 'TD' },
        scoringType: { name: 'touchdown', abbreviation: 'TD' },
        text: 'KJ Bolden 41 yd interception return for a TD, Peyton Woodring extra point is GOOD',
        period: { number: 3 },
        clock: { displayValue: '7:30' },
        team: { id: '61' },
        awayScore: 21, homeScore: 10,
        wallclock: '2025-11-08T22:01:00Z',
      },
      {
        id: '4016283016',
        sequenceNumber: '6',
        type: { id: '67', text: 'Rushing Touchdown', abbreviation: 'TD' },
        scoringType: { name: 'touchdown', abbreviation: 'TD' },
        text: 'Ty Simpson 1 yd rush for a TD, Conor Talty extra point is GOOD',
        period: { number: 3 },
        clock: { displayValue: '5:04' },
        team: { id: '333' },
        awayScore: 21, homeScore: 17,
        wallclock: '2025-11-08T22:12:00Z',
      },
    ],
  },

  // Georgia Tech at Clemson — the other favorite, close and late.
  '401628302': {
    header: { id: '401628302' },
    scoringPlays: [
      {
        id: '4016283021',
        sequenceNumber: '1',
        type: { id: '67', text: 'Rushing Touchdown', abbreviation: 'TD' },
        scoringType: { name: 'touchdown', abbreviation: 'TD' },
        text: 'Haynes King 7 yd rush for a TD, Aidan Birr extra point is GOOD',
        period: { number: 1 },
        clock: { displayValue: '6:22' },
        team: { id: '59' },
        awayScore: 7, homeScore: 0,
        wallclock: '2025-11-08T20:28:00Z',
      },
      {
        id: '4016283022',
        sequenceNumber: '2',
        type: { id: '68', text: 'Passing Touchdown', abbreviation: 'TD' },
        scoringType: { name: 'touchdown', abbreviation: 'TD' },
        text: 'Cade Klubnik pass complete to Antonio Williams for 22 yds for a TD, Nolan Hauser extra point is GOOD',
        period: { number: 2 },
        clock: { displayValue: '10:47' },
        team: { id: '228' },
        awayScore: 7, homeScore: 7,
        wallclock: '2025-11-08T21:02:00Z',
      },
      {
        id: '4016283023',
        sequenceNumber: '3',
        type: { id: '59', text: 'Field Goal Good', abbreviation: 'FG' },
        scoringType: { name: 'field-goal', abbreviation: 'FG' },
        text: 'Aidan Birr 33 yd Field Goal GOOD',
        period: { number: 3 },
        clock: { displayValue: '2:15' },
        team: { id: '59' },
        awayScore: 24, homeScore: 20,
        wallclock: '2025-11-08T22:20:00Z',
      },
      {
        id: '4016283024',
        sequenceNumber: '4',
        type: { id: '68', text: 'Passing Touchdown', abbreviation: 'TD' },
        scoringType: { name: 'touchdown', abbreviation: 'TD' },
        text: 'Cade Klubnik pass complete to Bryant Wesco Jr. for 48 yds for a TD, Nolan Hauser extra point is GOOD',
        period: { number: 4 },
        clock: { displayValue: '3:29' },
        team: { id: '228' },
        awayScore: 24, homeScore: 27,
        wallclock: '2025-11-08T22:46:00Z',
      },
    ],
  },
};
