// The starting data: an empty budget, and a made-up sample household so new buyers see the app working.
export const blankState = () => ({
  currency: 'USD',
  pay: { frequency: 'biweekly', firstDate: '2027-01-08', amount: 0, semi1: 15, semi2: 31, monthlyDay: 1, weekendRule: 'before' },
  bills: [],
  allotments: [],
  spending: [],     // { id, date, amount, note }: money spent outside bills and set-asides
  overrides: {},    // bill occurrence key -> paycheck date it was moved to
  paid: {},         // bill occurrence key -> true
  payOverrides: {}, // paycheck date -> custom amount
  bonus: {},        // bonus paycheck date -> what it's for ('savings', 'debt', 'holidays', 'treat', 'spend')
  cushionStart: 0,  // money already in the bank before the first 2027 payday
  owner: { name: '', appName: '' }, // the buyer's name and their own name for the app
  sample: false,
});

export const sampleState = () => ({
  ...blankState(),
  sample: true,
  pay: { ...blankState().pay, amount: 2450 },
  cushionStart: 400,
  bonus: { '2027-04-30': 'savings' },
  bills: [
    { id: 's-rent', name: 'Rent', amount: 1450, freq: 'monthly', day: 1, date: '' },
    { id: 's-stream', name: 'Streaming', amount: 23, freq: 'monthly', day: 3, date: '' },
    { id: 's-carins', name: 'Car insurance', amount: 142, freq: 'monthly', day: 5, date: '' },
    { id: 's-net', name: 'Internet', amount: 60, freq: 'monthly', day: 10, date: '' },
    { id: 's-gym', name: 'Gym', amount: 35, freq: 'monthly', day: 12, date: '' },
    { id: 's-power', name: 'Electricity', amount: 95, freq: 'monthly', day: 14, date: '' },
    { id: 's-car', name: 'Car payment', amount: 365, freq: 'monthly', day: 18, date: '' },
    { id: 's-phone', name: 'Phone', amount: 78, freq: 'monthly', day: 22, date: '' },
    { id: 's-loan', name: 'Student loan', amount: 210, freq: 'monthly', day: 25, date: '' },
    { id: 's-prime', name: 'Online shopping membership', amount: 139, freq: 'yearly', day: 1, date: '2027-03-09' },
    { id: 's-reg', name: 'Car registration', amount: 180, freq: 'yearly', day: 1, date: '2027-07-20' },
    { id: 's-gifts', name: 'Holiday gifts', amount: 600, freq: 'once', day: 1, date: '2027-12-10' },
  ],
  allotments: [
    { id: 's-food', name: 'Groceries', amount: 260 },
    { id: 's-gas', name: 'Gas', amount: 80 },
    { id: 's-emerg', name: 'Emergency fund', amount: 150, goal: 3000, saved: 1200 },
    { id: 's-fun', name: 'Fun money', amount: 60 },
  ],
  spending: [
    { id: 's-sp1', date: '2027-01-09', amount: 6.5, note: 'Coffee with a friend' },
    { id: 's-sp2', date: '2027-01-12', amount: 35, note: 'Birthday gift' },
    { id: 's-sp3', date: '2027-01-15', amount: 28, note: 'Takeout' },
  ],
});
