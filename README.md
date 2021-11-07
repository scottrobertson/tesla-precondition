# Tesla Precondition

An API endpoint to preheat your Tesla. You can create a shortcut on your mobile device (such as iOS Shortcuts, or Tasker) to call this endpoint to precondition/preheat your car.

This is designed to work with Cloudflare Workers, but I am sure it could work elsewhere with some modifications. Feel free to submit a PR.

## Deploy to Cloudflare Workers

Note: this will require you supplying your Tesla login details in the Cloudflare dashboard. If you are not comfortable with this, feel free to PR in support for tokens.

Docs need improving, but here they are in their most raw form:

- Install `wrangler` CLI:

```bash
npm install -g @cloudflare/wrangler
```

- Copy the example config:

```bash
cp wrangler.toml.example wrangler.toml
```

- Head over to [Cloudflare](https://dash.cloudflare.com/) and click on Workers
- Add your `account_id` from Cloudflare Workers into `wrangler.toml`
- Publish to Cloudflare:

```bash
wrangler login # You only need to do this once
wrangler publish
```

> Make note of the URL it gives you at the end of this. You will need it later.

By default, the script will wake up your Tesla and turn climate on. You can also specify the temperature (in Celsius) by adding a `temp` query argument and turn the seats on with `seats`.

The page may take a while to load, as it waits for your Tesla to wake up.

## Usage

To use this endpoint, you need to generate a Tesla Access Token. You can do this using one of the following apps:

- TODO: iOS App
- TODO: Android App

One you have one of those tokens, you can pass it to the API endpoint using query params below.

### Query params

To control the API endpoint, you can use the following query params

| name         | required? | description                                                |
| ------------ | --------- | ---------------------------------------------------------- |
| vin          | yes       | The VIN of the car you want to control                     |
| access_token | yes       | Your Tesla Access Token                                    |
| temp         | no        | Desired temperature in Celsius                             |
| seats        | no        | Comma-separated heat levels (0-3) for each seat. See below |

### Seat Numbers

```
0 Driver
1 Passenger
2 Rear left
3 NOT USED
4 Rear center
5 Rear right
```

An example to turn on all seats to max: `?seats=3,3,3,0,3,3`

## Examples

The bare minimum. Just turn on climate.

```
https://tesla.your-subdomain.workers.dev?access_token=YOUR_ACCESS_TOKEN
```

Specify a temperature and turn on the two front seats (driver at level 3, passenger at level 1)

```
https://tesla.your-subdomain.workers.dev?access_token=YOUR_ACCESS_TOKEN&temp=20&seats=3,1
```

## Setup iOS Shortcut

- Install and Setup "AUth for Tesla" app.
- Open Shortcuts
- Add a Shortcut
- Add an action of "Get Contents Of URL"
- Add your URL from above, including appending your token: `?access_token=YOUR_ACCESS_TOKEN` along with any other params you want.
