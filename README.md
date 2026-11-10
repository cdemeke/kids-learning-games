# Penny and Theo's Fun Learning Games

**[Play Now](https://cdemeke.github.io/kids-learning-games/)**

This repo features interactive games created by my kids Penny and Theo. Every game was built using AI assistance, with my help to set up the environment so they could focus on creativity and testing.

## Games

- **Block Stacker** - Stack colorful blocks and build the tallest tower
- **Car Garage** - Match cars to their colorful garages and learn colors
- **Emergency Helpers** - Learn about firefighters and police heroes
- **Water Maker** - Mix hydrogen and oxygen to make water and learn science
- **Shape Party** - Find circles, stars, hearts and more shapes
- **Number Fishing** - Count the fish and pick the right number
- **Letter Rocket** - Find the right letter to launch a rocket and learn ABCs
- **Pattern Train** - Finish the pattern to make the train go
- **Animal Match** - Flip cards and match animal pairs to train memory
- **Sky Hopper** - Bounce up floating grass platforms, grab stars and ride balloons
- **Kitty Bakery** - Serve hungry kitties by adding, subtracting and counting treats onto their plates
- **Turbo Karts** - 3D kart racing on 5 tracks with drifting, boosts, zaps and 2-player split screen
- **Midnight Cookie Heist** - Sneak past flashlights, freeze on creaky floors and bring the cookie jar back to bed
- **Super Tennis Stars** - 1 or 2 player tennis with power-ups: super speed, giant ball, mega racket and freeze
- **Street Rush GT: Underground** - Comic-style 3D street racing with drifting, nitro, city traffic, a garage of unlockable cars and up to 4-player split screen (keyboard or gamepads)
- **Airport Explorer** - Learn 36 U.S. airport codes: pick from four cities in easy mode or pin the airport within 40 miles in hard mode. Ten-stop trips, a travel journal, and practice for missed codes.
- **Caterpillar Munch** - Steer a caterpillar to munch letters, numbers or skip counts in order, then hatch a collectible butterfly
- **Froggy Crossing** - Hop across roads and rivers to the lily pad with the right answer to a math or letter question
- **Penguin Ice Slide** - Calm sliding puzzles: plan moves so the penguin stops on the fish hole, with hints, undo and endless random puzzles
- **Froggy Feast** - So many flies and one hungry frog! Tap (or aim with the arrow keys) to slurp flies, dragonflies and golden flies. Forever Feast never stops; Quick Snack is a one-minute challenge. Eat more flies to unlock six frog friends.
- **Snowball Showdown** - Paint two teams of snow kids, penguins, polar bears, snow cannons and cocoa pals, build snow walls and ice, then press GO and watch the snowball fight. Compare team sizes with >, < and =, guess the winner, and see how many are left (12 − 5 = 7). Snow Challenges give you a snowflake budget to beat 12 ready-made Blue teams.

## How to Play

Visit **https://cdemeke.github.io/kids-learning-games/** and pick a game!

## Mac desktop app

Install Node.js, then run these commands in this folder:

```sh
npm ci
npm start
```

To create a standalone Mac app:

```sh
npm run build:mac
```

Open **Penny and Theo Games.app** inside `dist/mac-arm64` (Apple Silicon)
 or `dist/mac` (Intel). You can copy it to Applications and keep it in the Dock.
The app bundles the games; you do not need a web server or Terminal to run the packaged app.
This local build is not signed/notarized for distribution to other computers.

- **Up/Down** (or Left/Right): select the previous/next game, wrapping at the ends.
- **Enter**: open the selected game. Tab navigation also works.
- **Escape** in the desktop app: return to the game chooser (ends the current game).
- Use **Games → Toggle Full Screen** for full screen.

The chooser remembers the last opened game during the session. Individual games
retain their own controls; mouse/touch games still require pointing during play.
Internet is still needed for games that load external libraries or map resources.
Desktop progress is stored separately from progress in Chrome.
