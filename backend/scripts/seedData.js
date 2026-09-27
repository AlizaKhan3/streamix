// Sample catalog used until a TMDb key is configured.
// Ids below 9,000,000 are the real TMDb ids, so `POST /admin/tmdb/enrich`
// can later fill in posters/cast. Pakistani titles use local ids (9000001+).
//
// license: which regions may show the title  (geo-partitioning)
// origin : region that owns it / its reviews (first entry of license)

const G = ['PK', 'US']; // globally licensed
const PK = ['PK'];
const US = ['US'];

const cast = (...names) => names.map((name) => ({ name }));

module.exports.movies = [
  // ---------------- global Hollywood / world cinema (origin US) ----------------
  { content_id: 27205, title: 'Inception', release_year: 2010, director: 'Christopher Nolan', genres: ['Action', 'Science Fiction', 'Thriller'], language: 'en', popularity: 95, license: G, origin: 'US', cast: cast('Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page', 'Tom Hardy'), overview: 'A thief who steals secrets from inside dreams is offered a chance to erase his past by planting an idea instead.' },
  { content_id: 155, title: 'The Dark Knight', release_year: 2008, director: 'Christopher Nolan', genres: ['Action', 'Crime', 'Drama'], language: 'en', popularity: 98, license: G, origin: 'US', cast: cast('Christian Bale', 'Heath Ledger', 'Aaron Eckhart'), overview: 'Batman faces the Joker, a criminal mastermind who wants to plunge Gotham City into anarchy.' },
  { content_id: 157336, title: 'Interstellar', release_year: 2014, director: 'Christopher Nolan', genres: ['Adventure', 'Drama', 'Science Fiction'], language: 'en', popularity: 97, license: G, origin: 'US', cast: cast('Matthew McConaughey', 'Anne Hathaway', 'Jessica Chastain'), overview: 'Explorers travel through a wormhole in search of a new home for humanity.' },
  { content_id: 603, title: 'The Matrix', release_year: 1999, director: 'Lana Wachowski, Lilly Wachowski', genres: ['Action', 'Science Fiction'], language: 'en', popularity: 80, license: G, origin: 'US', cast: cast('Keanu Reeves', 'Laurence Fishburne', 'Carrie-Anne Moss'), overview: 'A hacker learns that the world he lives in is a simulation and joins the fight against its controllers.' },
  { content_id: 278, title: 'The Shawshank Redemption', release_year: 1994, director: 'Frank Darabont', genres: ['Drama', 'Crime'], language: 'en', popularity: 85, license: G, origin: 'US', cast: cast('Tim Robbins', 'Morgan Freeman'), overview: 'Two imprisoned men form a lasting friendship and find hope over many years behind bars.' },
  { content_id: 238, title: 'The Godfather', release_year: 1972, director: 'Francis Ford Coppola', genres: ['Drama', 'Crime'], language: 'en', popularity: 82, license: G, origin: 'US', cast: cast('Marlon Brando', 'Al Pacino', 'James Caan'), overview: 'The aging head of a crime family hands control of his empire to his reluctant son.' },
  { content_id: 13, title: 'Forrest Gump', release_year: 1994, director: 'Robert Zemeckis', genres: ['Comedy', 'Drama', 'Romance'], language: 'en', popularity: 78, license: G, origin: 'US', cast: cast('Tom Hanks', 'Robin Wright', 'Gary Sinise'), overview: 'A kind-hearted man unexpectedly finds himself at the centre of decades of American history.' },
  { content_id: 597, title: 'Titanic', release_year: 1997, director: 'James Cameron', genres: ['Drama', 'Romance'], language: 'en', popularity: 79, license: G, origin: 'US', cast: cast('Leonardo DiCaprio', 'Kate Winslet'), overview: 'Two passengers from different social classes fall in love aboard the doomed ship.' },
  { content_id: 19995, title: 'Avatar', release_year: 2009, director: 'James Cameron', genres: ['Action', 'Adventure', 'Fantasy', 'Science Fiction'], language: 'en', popularity: 88, license: G, origin: 'US', cast: cast('Sam Worthington', 'Zoe Saldaña', 'Sigourney Weaver'), overview: 'A marine on the alien world Pandora is torn between his orders and the people he comes to protect.' },
  { content_id: 299534, title: 'Avengers: Endgame', release_year: 2019, director: 'Anthony Russo, Joe Russo', genres: ['Adventure', 'Science Fiction', 'Action'], language: 'en', popularity: 96, license: G, origin: 'US', cast: cast('Robert Downey Jr.', 'Chris Evans', 'Scarlett Johansson'), overview: 'The surviving Avengers assemble once more to undo the devastation caused by Thanos.' },
  { content_id: 496243, title: 'Parasite', release_year: 2019, director: 'Bong Joon Ho', genres: ['Comedy', 'Thriller', 'Drama'], language: 'ko', popularity: 75, license: G, origin: 'US', cast: cast('Song Kang-ho', 'Lee Sun-kyun', 'Cho Yeo-jeong'), overview: 'A poor family schemes its way into the lives of a wealthy household, with unexpected results.' },
  { content_id: 475557, title: 'Joker', release_year: 2019, director: 'Todd Phillips', genres: ['Crime', 'Thriller', 'Drama'], language: 'en', popularity: 84, license: G, origin: 'US', cast: cast('Joaquin Phoenix', 'Robert De Niro', 'Zazie Beetz'), overview: 'A struggling comedian in Gotham City slowly descends into madness.' },
  { content_id: 438631, title: 'Dune', release_year: 2021, director: 'Denis Villeneuve', genres: ['Science Fiction', 'Adventure'], language: 'en', popularity: 90, license: G, origin: 'US', cast: cast('Timothée Chalamet', 'Rebecca Ferguson', 'Oscar Isaac', 'Zendaya'), overview: 'A young nobleman is drawn into a struggle for the most valuable resource in the universe on the desert planet Arrakis.' },
  { content_id: 862, title: 'Toy Story', release_year: 1995, director: 'John Lasseter', genres: ['Animation', 'Adventure', 'Family', 'Comedy'], language: 'en', popularity: 70, license: G, origin: 'US', cast: cast('Tom Hanks', 'Tim Allen'), overview: "A cowboy doll feels threatened when a new space-ranger toy becomes his owner's favourite." },
  { content_id: 354912, title: 'Coco', release_year: 2017, director: 'Lee Unkrich', genres: ['Animation', 'Family', 'Fantasy', 'Music'], language: 'en', popularity: 76, license: G, origin: 'US', cast: cast('Anthony Gonzalez', 'Gael García Bernal', 'Benjamin Bratt'), overview: 'A boy who dreams of becoming a musician journeys into the Land of the Dead.' },
  { content_id: 129, title: 'Spirited Away', release_year: 2001, director: 'Hayao Miyazaki', genres: ['Animation', 'Family', 'Fantasy'], language: 'ja', popularity: 72, license: G, origin: 'US', cast: cast('Rumi Hiiragi', 'Miyu Irino'), overview: 'A girl trapped in a world of spirits must work in a bathhouse to free herself and her parents.' },
  { content_id: 98, title: 'Gladiator', release_year: 2000, director: 'Ridley Scott', genres: ['Action', 'Drama', 'Adventure'], language: 'en', popularity: 77, license: G, origin: 'US', cast: cast('Russell Crowe', 'Joaquin Phoenix', 'Connie Nielsen'), overview: 'A betrayed Roman general fights his way back as a gladiator to seek justice.' },
  { content_id: 329, title: 'Jurassic Park', release_year: 1993, director: 'Steven Spielberg', genres: ['Adventure', 'Science Fiction'], language: 'en', popularity: 74, license: G, origin: 'US', cast: cast('Sam Neill', 'Laura Dern', 'Jeff Goldblum'), overview: 'A theme park of cloned dinosaurs turns deadly when its security systems fail.' },
  { content_id: 324857, title: 'Spider-Man: Into the Spider-Verse', release_year: 2018, director: 'Bob Persichetti, Peter Ramsey, Rodney Rothman', genres: ['Animation', 'Action', 'Adventure', 'Science Fiction'], language: 'en', popularity: 81, license: G, origin: 'US', cast: cast('Shameik Moore', 'Hailee Steinfeld', 'Jake Johnson'), overview: 'Teenager Miles Morales becomes Spider-Man and meets heroes from other dimensions.' },
  { content_id: 14160, title: 'Up', release_year: 2009, director: 'Pete Docter', genres: ['Animation', 'Comedy', 'Family', 'Adventure'], language: 'en', popularity: 71, license: G, origin: 'US', cast: cast('Ed Asner', 'Jordan Nagai'), overview: 'An elderly widower ties balloons to his house and flies off on an adventure, with a young stowaway.' },
  { content_id: 20453, title: '3 Idiots', release_year: 2009, director: 'Rajkumar Hirani', genres: ['Comedy', 'Drama'], language: 'hi', popularity: 66, license: G, origin: 'PK', cast: cast('Aamir Khan', 'R. Madhavan', 'Sharman Joshi', 'Kareena Kapoor'), overview: 'Two friends search for a college classmate who taught them to chase excellence instead of marks.' },
  { content_id: 360814, title: 'Dangal', release_year: 2016, director: 'Nitesh Tiwari', genres: ['Drama', 'Action'], language: 'hi', popularity: 60, license: G, origin: 'PK', cast: cast('Aamir Khan', 'Sakshi Tanwar', 'Fatima Sana Shaikh'), overview: 'A former wrestler trains his daughters to become world-class wrestlers.' },

  // ---------------- US-only licences ----------------
  { content_id: 872585, title: 'Oppenheimer', release_year: 2023, director: 'Christopher Nolan', genres: ['Drama', 'History'], language: 'en', popularity: 93, license: US, origin: 'US', cast: cast('Cillian Murphy', 'Emily Blunt', 'Matt Damon', 'Robert Downey Jr.'), overview: 'The story of J. Robert Oppenheimer and the creation of the atomic bomb.' },
  { content_id: 680, title: 'Pulp Fiction', release_year: 1994, director: 'Quentin Tarantino', genres: ['Thriller', 'Crime'], language: 'en', popularity: 76, license: US, origin: 'US', cast: cast('John Travolta', 'Samuel L. Jackson', 'Uma Thurman'), overview: 'Interlocking stories of Los Angeles criminals, a boxer and a pair of hitmen.' },
  { content_id: 550, title: 'Fight Club', release_year: 1999, director: 'David Fincher', genres: ['Drama'], language: 'en', popularity: 73, license: US, origin: 'US', cast: cast('Brad Pitt', 'Edward Norton', 'Helena Bonham Carter'), overview: 'An insomniac office worker and a soap maker start an underground fight club.' },
  { content_id: 24428, title: 'The Avengers', release_year: 2012, director: 'Joss Whedon', genres: ['Science Fiction', 'Action', 'Adventure'], language: 'en', popularity: 83, license: US, origin: 'US', cast: cast('Robert Downey Jr.', 'Chris Evans', 'Scarlett Johansson'), overview: "Earth's mightiest heroes must learn to work together to stop an alien invasion." },
  { content_id: 1726, title: 'Iron Man', release_year: 2008, director: 'Jon Favreau', genres: ['Action', 'Science Fiction', 'Adventure'], language: 'en', popularity: 70, license: US, origin: 'US', cast: cast('Robert Downey Jr.', 'Terrence Howard', 'Gwyneth Paltrow'), overview: 'A billionaire engineer builds a powered suit of armour to escape captivity.' },
  { content_id: 109445, title: 'Frozen', release_year: 2013, director: 'Chris Buck, Jennifer Lee', genres: ['Animation', 'Family', 'Adventure', 'Fantasy'], language: 'en', popularity: 68, license: US, origin: 'US', cast: cast('Kristen Bell', 'Idina Menzel', 'Josh Gad'), overview: 'A princess sets off to find her sister, whose icy powers have trapped the kingdom in eternal winter.' },
  { content_id: 284054, title: 'Black Panther', release_year: 2018, director: 'Ryan Coogler', genres: ['Action', 'Adventure', 'Science Fiction'], language: 'en', popularity: 72, license: US, origin: 'US', cast: cast('Chadwick Boseman', 'Michael B. Jordan', "Lupita Nyong'o"), overview: 'The new king of Wakanda must defend his nation and his throne.' },

  // ---------------- Pakistani titles (origin PK) ----------------
  { content_id: 9000001, title: 'The Legend of Maula Jatt', release_year: 2022, director: 'Bilal Lashari', genres: ['Action', 'Drama'], language: 'pa', popularity: 89, license: G, origin: 'PK', cast: cast('Fawad Khan', 'Mahira Khan', 'Hamza Ali Abbasi', 'Humaima Malick'), overview: 'A fierce warrior seeks vengeance against the ruthless Noori Natt and his clan.' },
  { content_id: 9000002, title: 'Joyland', release_year: 2022, director: 'Saim Sadiq', genres: ['Drama'], language: 'ur', popularity: 64, license: G, origin: 'PK', cast: cast('Ali Junejo', 'Alina Khan', 'Rasti Farooq', 'Sarwat Gilani'), overview: "A young man in Lahore secretly joins an erotic dance theatre and falls for its trans starlet, unsettling his family's expectations." },
  { content_id: 9000003, title: 'Bol', release_year: 2011, director: 'Shoaib Mansoor', genres: ['Drama'], language: 'ur', popularity: 70, license: PK, origin: 'PK', cast: cast('Humaima Malick', 'Mahira Khan', 'Atif Aslam', 'Iman Ali', 'Manzar Sehbai'), overview: 'A young woman recounts the story of a family crushed under the weight of its patriarch.' },
  { content_id: 9000004, title: 'Khuda Kay Liye', release_year: 2007, director: 'Shoaib Mansoor', genres: ['Drama'], language: 'ur', popularity: 62, license: PK, origin: 'PK', cast: cast('Shaan Shahid', 'Fawad Khan', 'Iman Ali'), overview: 'Two musician brothers are pulled in very different directions in a changing world.' },
  { content_id: 9000005, title: 'Waar', release_year: 2013, director: 'Bilal Lashari', genres: ['Action', 'Thriller'], language: 'ur', popularity: 67, license: PK, origin: 'PK', cast: cast('Shaan Shahid', 'Meesha Shafi', 'Ali Azmat', 'Hamza Ali Abbasi'), overview: 'A retired officer returns to stop a devastating attack being planned against his country.' },
  { content_id: 9000006, title: 'Jawani Phir Nahi Ani', release_year: 2015, director: 'Nadeem Baig', genres: ['Comedy'], language: 'ur', popularity: 58, license: PK, origin: 'PK', cast: cast('Humayun Saeed', 'Hamza Ali Abbasi', 'Vasay Chaudhry', 'Ahmad Ali Butt'), overview: 'Four friends escape their married lives for a wild trip that does not go to plan.' },
  { content_id: 9000007, title: 'Punjab Nahi Jaungi', release_year: 2017, director: 'Nadeem Baig', genres: ['Comedy', 'Romance', 'Drama'], language: 'ur', popularity: 57, license: PK, origin: 'PK', cast: cast('Humayun Saeed', 'Mehwish Hayat', 'Urwa Hocane'), overview: 'A city girl marries a wealthy landowner from Punjab on the condition that she will never live in his village.' },
  { content_id: 9000008, title: 'Cake', release_year: 2018, director: 'Asim Abbasi', genres: ['Drama', 'Family'], language: 'ur', popularity: 50, license: PK, origin: 'PK', cast: cast('Aamina Sheikh', 'Sanam Saeed', 'Adnan Malik'), overview: 'Two sisters reunite when a family crisis forces old tensions to the surface.' },
  { content_id: 9000009, title: 'Parey Hut Love', release_year: 2019, director: 'Asim Raza', genres: ['Romance', 'Comedy'], language: 'ur', popularity: 49, license: PK, origin: 'PK', cast: cast('Sheheryar Munawar', 'Maya Ali'), overview: 'A struggling actor falls for a woman who is already engaged to someone else.' },
  { content_id: 9000010, title: 'Teefa in Trouble', release_year: 2018, director: 'Ahsan Rahim', genres: ['Action', 'Comedy', 'Romance'], language: 'ur', popularity: 55, license: PK, origin: 'PK', cast: cast('Ali Zafar', 'Maya Ali'), overview: 'A small-time enforcer is hired to bring a woman back to Lahore and ends up falling for her.' },
  { content_id: 9000011, title: 'Laal Kabootar', release_year: 2019, director: 'Kamal Khan', genres: ['Crime', 'Thriller'], language: 'ur', popularity: 52, license: PK, origin: 'PK', cast: cast('Ahmed Ali Akbar', 'Mansha Pasha'), overview: 'A taxi driver and a widow seeking justice cross paths in the underworld of Karachi.' },
  { content_id: 9000012, title: 'Humsafar', media_type: 'tv', release_year: 2011, director: 'Sarmad Khoosat', genres: ['Drama', 'Romance'], language: 'ur', popularity: 69, license: PK, origin: 'PK', cast: cast('Fawad Khan', 'Mahira Khan', 'Naveen Waqar'), overview: 'A marriage built on duty grows into love, until misunderstanding and a scheming mother pull it apart.' },
  { content_id: 9000013, title: 'Zindagi Gulzar Hai', media_type: 'tv', release_year: 2012, director: 'Sultana Siddiqui', genres: ['Drama', 'Romance'], language: 'ur', popularity: 63, license: PK, origin: 'PK', cast: cast('Fawad Khan', 'Sanam Saeed'), overview: 'A hard-working young woman and a privileged young man slowly overcome their differences.' },
];

module.exports.users = [
  { email: 'admin@streamix.pk', password: 'Admin@123', fullName: 'PK Admin', region: 'PK', role: 'admin', favoriteGenres: ['Drama'] },
  { email: 'admin@streamix.us', password: 'Admin@123', fullName: 'US Admin', region: 'US', role: 'admin', favoriteGenres: ['Action'] },
  { email: 'ali@streamix.pk', password: 'User@123', fullName: 'Ali Raza', region: 'PK', role: 'user', favoriteGenres: ['Action', 'Drama'] },
  { email: 'emma@streamix.us', password: 'User@123', fullName: 'Emma Carter', region: 'US', role: 'user', favoriteGenres: ['Science Fiction', 'Animation'] },
];

// [email, content_id, rating, comment]
module.exports.reviews = [
  ['ali@streamix.pk', 27205, 5, 'Mind-bending from start to finish.'],
  ['ali@streamix.pk', 9000001, 5, 'Pakistani cinema at its biggest. Fawad Khan is superb.'],
  ['ali@streamix.pk', 9000003, 4, 'Powerful and hard to watch at times.'],
  ['ali@streamix.pk', 155, 5, "Heath Ledger's Joker is unforgettable."],
  ['emma@streamix.us', 157336, 5, 'The docking scene still gives me chills.'],
  ['emma@streamix.us', 354912, 4, 'Beautiful music and a lot of heart.'],
  ['emma@streamix.us', 872585, 5, 'Stunning performances all round.'],
  ['emma@streamix.us', 9000002, 4, 'Quiet, brave and moving.'],
  ['emma@streamix.us', 27205, 4, 'Great, though the ending is still debated at home.'],
];

// [email, content_id, status]
module.exports.watchlist = [
  ['ali@streamix.pk', 438631, 'saved'],
  ['ali@streamix.pk', 9000005, 'watched'],
  ['emma@streamix.us', 496243, 'saved'],
];
