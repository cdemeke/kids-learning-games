// Airport coordinates and names: OurAirports, public domain. See SOURCES.md.
window.AIRPORTS = [
  {
    "code": "IAD",
    "city": "Washington, DC",
    "state": "VA",
    "region": "Virginia",
    "name": "Washington Dulles International Airport",
    "lat": 38.9445,
    "lon": -77.455803,
    "clue": "IAD is Dulles, near Washington, DC. Don’t mix it up with IDA in Idaho Falls!"
  },
  {
    "code": "DCA",
    "city": "Washington, DC",
    "state": "VA",
    "region": "Virginia",
    "name": "Ronald Reagan Washington National Airport",
    "lat": 38.8521,
    "lon": -77.037697,
    "clue": "DCA is Reagan National, just across the Potomac River from Washington, DC."
  },
  {
    "code": "BWI",
    "city": "Baltimore",
    "state": "MD",
    "region": "Maryland",
    "name": "Baltimore/Washington International Thurgood Marshall Airport",
    "lat": 39.1754,
    "lon": -76.668297,
    "clue": "BWI stands for Baltimore/Washington International. It is closer to Baltimore."
  },
  {
    "code": "IDA",
    "city": "Idaho Falls",
    "state": "ID",
    "region": "Idaho",
    "name": "Idaho Falls Regional Airport",
    "lat": 43.514599,
    "lon": -112.070999,
    "clue": "IDA is Idaho Falls. Watch the order: IAD is Washington Dulles!"
  },
  {
    "code": "JFK",
    "city": "New York City",
    "state": "NY",
    "region": "New York",
    "name": "John F. Kennedy International Airport",
    "lat": 40.639447,
    "lon": -73.779317,
    "clue": "JFK is named for President John F. Kennedy. It is in New York City."
  },
  {
    "code": "EWR",
    "city": "Newark",
    "state": "NJ",
    "region": "New Jersey",
    "name": "Newark Liberty International Airport",
    "lat": 40.6894,
    "lon": -74.170545,
    "clue": "Newark is in New Jersey, next to New York City. Look for the letters E-W-R in Newark."
  },
  {
    "code": "BOS",
    "city": "Boston",
    "state": "MA",
    "region": "Massachusetts",
    "name": "Boston Logan International Airport",
    "lat": 42.36197,
    "lon": -71.0079,
    "clue": "BOS is your ticket to Boston, Massachusetts. Say the code and city together!"
  },
  {
    "code": "PHL",
    "city": "Philadelphia",
    "state": "PA",
    "region": "Pennsylvania",
    "name": "Philadelphia International Airport",
    "lat": 39.871899,
    "lon": -75.241096,
    "clue": "PHL is your ticket to Philadelphia, Pennsylvania. Say the code and city together!"
  },
  {
    "code": "ATL",
    "city": "Atlanta",
    "state": "GA",
    "region": "Georgia",
    "name": "Hartsfield Jackson Atlanta International Airport",
    "lat": 33.6367,
    "lon": -84.428101,
    "clue": "ATL is your ticket to Atlanta, Georgia. Say the code and city together!"
  },
  {
    "code": "MIA",
    "city": "Miami",
    "state": "FL",
    "region": "Florida",
    "name": "Miami International Airport",
    "lat": 25.796011,
    "lon": -80.289751,
    "clue": "MIA is your ticket to Miami, Florida. Say the code and city together!"
  },
  {
    "code": "MCO",
    "city": "Orlando",
    "state": "FL",
    "region": "Florida",
    "name": "Orlando International Airport",
    "lat": 28.429399490356445,
    "lon": -81.30899810791016,
    "clue": "Orlando’s code comes from its old name, McCoy Air Force Base."
  },
  {
    "code": "TPA",
    "city": "Tampa",
    "state": "FL",
    "region": "Florida",
    "name": "Tampa International Airport",
    "lat": 27.9755,
    "lon": -82.533203,
    "clue": "TPA is your ticket to Tampa, Florida. Say the code and city together!"
  },
  {
    "code": "CLT",
    "city": "Charlotte",
    "state": "NC",
    "region": "North Carolina",
    "name": "Charlotte Douglas International Airport",
    "lat": 35.2140007019043,
    "lon": -80.94309997558594,
    "clue": "CLT is your ticket to Charlotte, North Carolina. Say the code and city together!"
  },
  {
    "code": "RDU",
    "city": "Raleigh/Durham",
    "state": "NC",
    "region": "North Carolina",
    "name": "Raleigh-Durham International Airport",
    "lat": 35.878659,
    "lon": -78.7873,
    "clue": "RDU is your ticket to Raleigh/Durham, North Carolina. Say the code and city together!"
  },
  {
    "code": "ORD",
    "city": "Chicago",
    "state": "IL",
    "region": "Illinois",
    "name": "Chicago O'Hare International Airport",
    "lat": 41.9786,
    "lon": -87.9048,
    "clue": "Chicago O’Hare used to be called Orchard Field. That is where ORD comes from!"
  },
  {
    "code": "DTW",
    "city": "Detroit",
    "state": "MI",
    "region": "Michigan",
    "name": "Detroit Metropolitan Wayne County Airport",
    "lat": 42.21377,
    "lon": -83.353786,
    "clue": "DTW is your ticket to Detroit, Michigan. Say the code and city together!"
  },
  {
    "code": "MSP",
    "city": "Minneapolis",
    "state": "MN",
    "region": "Minnesota",
    "name": "Minneapolis–Saint Paul International Airport / Wold–Chamberlain Field",
    "lat": 44.880081,
    "lon": -93.221741,
    "clue": "MSP is your ticket to Minneapolis, Minnesota. Say the code and city together!"
  },
  {
    "code": "STL",
    "city": "St Louis",
    "state": "MO",
    "region": "Missouri",
    "name": "St. Louis Lambert International Airport",
    "lat": 38.748697,
    "lon": -90.370003,
    "clue": "STL is your ticket to St Louis, Missouri. Say the code and city together!"
  },
  {
    "code": "MCI",
    "city": "Kansas City",
    "state": "MO",
    "region": "Missouri",
    "name": "Kansas City International Airport",
    "lat": 39.301699,
    "lon": -94.713893,
    "clue": "Kansas City’s code comes from its old name, Mid-Continent International."
  },
  {
    "code": "DFW",
    "city": "Dallas–Fort Worth",
    "state": "TX",
    "region": "Texas",
    "name": "Dallas Fort Worth International Airport",
    "lat": 32.896801,
    "lon": -97.038002,
    "clue": "D is for Dallas, and FW is for Fort Worth. Two cities share this airport!"
  },
  {
    "code": "IAH",
    "city": "Houston",
    "state": "TX",
    "region": "Texas",
    "name": "George Bush Intercontinental Airport",
    "lat": 29.9844,
    "lon": -95.3414,
    "clue": "IAH is your ticket to Houston, Texas. Say the code and city together!"
  },
  {
    "code": "AUS",
    "city": "Austin",
    "state": "TX",
    "region": "Texas",
    "name": "Austin Bergstrom International Airport",
    "lat": 30.197535,
    "lon": -97.662015,
    "clue": "AUS is your ticket to Austin, Texas. Say the code and city together!"
  },
  {
    "code": "DEN",
    "city": "Denver",
    "state": "CO",
    "region": "Colorado",
    "name": "Denver International Airport",
    "lat": 39.860027,
    "lon": -104.673792,
    "clue": "DEN is your ticket to Denver, Colorado. Say the code and city together!"
  },
  {
    "code": "SLC",
    "city": "Salt Lake City",
    "state": "UT",
    "region": "Utah",
    "name": "Salt Lake City International Airport",
    "lat": 40.78886,
    "lon": -111.979866,
    "clue": "SLC uses the first letters of Salt Lake City."
  },
  {
    "code": "PHX",
    "city": "Phoenix",
    "state": "AZ",
    "region": "Arizona",
    "name": "Phoenix Sky Harbor International Airport",
    "lat": 33.435302,
    "lon": -112.005905,
    "clue": "PHX is a short way to write Phoenix. Look for P, H, and X."
  },
  {
    "code": "LAS",
    "city": "Las Vegas",
    "state": "NV",
    "region": "Nevada",
    "name": "Harry Reid International Airport",
    "lat": 36.083361,
    "lon": -115.151817,
    "clue": "LAS is your ticket to Las Vegas, Nevada. Say the code and city together!"
  },
  {
    "code": "LAX",
    "city": "Los Angeles",
    "state": "CA",
    "region": "California",
    "name": "Los Angeles International Airport",
    "lat": 33.942501,
    "lon": -118.407997,
    "clue": "LA stands for Los Angeles. The X helped make it a three-letter code."
  },
  {
    "code": "SFO",
    "city": "San Francisco",
    "state": "CA",
    "region": "California",
    "name": "San Francisco International Airport",
    "lat": 37.619806,
    "lon": -122.374821,
    "clue": "Think San FranciscO to remember SFO."
  },
  {
    "code": "SAN",
    "city": "San Diego",
    "state": "CA",
    "region": "California",
    "name": "San Diego International Airport",
    "lat": 32.733601,
    "lon": -117.190002,
    "clue": "SAN is your ticket to San Diego, California. Say the code and city together!"
  },
  {
    "code": "SEA",
    "city": "Seattle",
    "state": "WA",
    "region": "Washington",
    "name": "Seattle–Tacoma International Airport",
    "lat": 47.447943,
    "lon": -122.310276,
    "clue": "SEA is your ticket to Seattle, Washington. Say the code and city together!"
  },
  {
    "code": "PDX",
    "city": "Portland",
    "state": "OR",
    "region": "Oregon",
    "name": "Portland International Airport",
    "lat": 45.588699,
    "lon": -122.598,
    "clue": "PortlanD plus X makes PDX."
  },
  {
    "code": "BNA",
    "city": "Nashville",
    "state": "TN",
    "region": "Tennessee",
    "name": "Nashville International Airport",
    "lat": 36.1245,
    "lon": -86.6782,
    "clue": "Nashville’s airport was once called Berry Field. That is the B in BNA."
  },
  {
    "code": "MSY",
    "city": "New Orleans",
    "state": "LA",
    "region": "Louisiana",
    "name": "Louis Armstrong New Orleans International Airport",
    "lat": 29.993401,
    "lon": -90.264673,
    "clue": "New Orleans’ code comes from the old name Moisant Stock Yards."
  },
  {
    "code": "PIT",
    "city": "Pittsburgh",
    "state": "PA",
    "region": "Pennsylvania",
    "name": "Pittsburgh International Airport",
    "lat": 40.491501,
    "lon": -80.232903,
    "clue": "PIT is your ticket to Pittsburgh, Pennsylvania. Say the code and city together!"
  },
  {
    "code": "CLE",
    "city": "Cleveland",
    "state": "OH",
    "region": "Ohio",
    "name": "Cleveland Hopkins International Airport",
    "lat": 41.411701,
    "lon": -81.8498,
    "clue": "CLE is your ticket to Cleveland, Ohio. Say the code and city together!"
  },
  {
    "code": "IND",
    "city": "Indianapolis",
    "state": "IN",
    "region": "Indiana",
    "name": "Indianapolis International Airport",
    "lat": 39.7173,
    "lon": -86.294403,
    "clue": "IND is your ticket to Indianapolis, Indiana. Say the code and city together!"
  }
];
