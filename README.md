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
- On Cloudflare, click "KV", and add a namespace called `TESLA`
- Copy that namespace ID into `wrangler.toml` into the `id` field under `kv_namespaces`
- Publish to Cloudflare:

```bash
wrangler login # You only need to do this once
wrangler publish
```

- Make note of the URL it gives you at the end of this. You will need it later.

Next, you need to configure your Tesla login details over in the Cloudflare Dashboard.

- In Cloudflare Workers, click your worker (that was published in the step above)
- Click "Settings"
- Click "Edit Variables" under "Environment Variables"
- Add `TESLA_EMAIL` and `TESLA_PASSWORD` and `VIN`
- Add a random string to `TOKEN` - this will be used to protect your API endpoint from random people using it.

This should now be setup. You can test that it's all working by going to the URL given previously, appended with `?token=YOUR_TOKEN`.

By default, the script will wake up your Tesla and turn climate on. You can also specify the temperature (in Celsius) by adding a `temp` query argument and turn the seats on with `seats`.

The page may take a while to load, as it waits for your Tesla to wake up.

## Query params

| name | required? | description |
----------------------------------
| token | yes | The unique token you set in Cloudflare |
| temp | no | Desired temperature in Celsius |
| seats | no | Seat heater settings, comma-separated starting, with driver seat |

## Examples

The bare minimum. Just turn on climate.

```
https://tesla-precondition.your-subdomain.workers.dev?token=YOUR_TOKEN
```

Specify a temperature and turn on the two front seats (driver at level 3, passenger at level 1)

```
https://tesla-precondition.your-subdomain.workers.dev?token=YOUR_TOKEN&temp=20&seats=3,1
```

## Setup iOS Shortcut

- Open Shortcuts
- Add a Shortcut
- Add an action of "Get Contents Of URL"
- Add your URL from above, including appending your token: `?token=YOUR_TOKEN`
