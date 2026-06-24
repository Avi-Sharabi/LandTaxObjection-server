export const AU_STATES = [
  { state_code: 'ACT', name: 'Australian Capital Territory' },
  { state_code: 'NSW', name: 'New South Wales' },
  { state_code: 'NT',  name: 'Northern Territory' },
  { state_code: 'QLD', name: 'Queensland' },
  { state_code: 'SA',  name: 'South Australia' },
  { state_code: 'TAS', name: 'Tasmania' },
  { state_code: 'VIC', name: 'Victoria' },
  { state_code: 'WA',  name: 'Western Australia' },
] as const;

export type AustralianStateCode = (typeof AU_STATES)[number]['state_code'];
