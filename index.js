addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * Respond with hello worker text
 * @param {Request} request
 */
async function handleRequest(request) {

  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (token === TOKEN) {

    try {
      await getVehicleIDFromVin()
      await wakeVehicle()
      await startHVAC()
      await setTemperature(TEMPERATURE)

      // Enable seat heaters
      await setSeatHeater(0, 3)
      await setSeatHeater(1, 3)
      await setSeatHeater(2, 3)
      await setSeatHeater(4, 3)
      await setSeatHeater(5, 3)

      return jsonResponse('Car is preconditioning to ' + TEMPERATURE + 'C, and the front seats have been turned on.')
    } catch (errorMessage) {
      return jsonResponse("Error: " + errorMessage)
    }
  } else {
    return jsonResponse('Token is invalid')
  }
}

async function jsonResponse(message) {
  return new Response(JSON.stringify({ response: message }), {
    headers: { 'content-type': 'application/json' },
  })
}

async function teslaHeaders() {
  let accessToken = await TESLA.get('access-token')

  if (accessToken === null) {
    let refreshToken = await TESLA.get('refresh-token')
    if (refreshToken === null && TESLA_EMAIL) {
      accessToken = await accessTokenFromEmailPassword()
    } else {
      accessToken = await accessTokenFromRefreshToken()
    }
  }

  if (accessToken === null) {
    throw 'No access token found'
  }

  const headers = new Headers();
  headers.set('Authorization', "Bearer " + accessToken)

  return headers
}

async function accessTokenFromEmailPassword() {
  headers = new Headers()
  headers.set('Content-Type', 'application/json')

  if (!TESLA_EMAIL || !TESLA_PASSWORD) {
    throw 'Tesla email and password must be set'
  }

  console.log('Getting access token')
  const request = new Request('https://owner-api.teslamotors.com/oauth/token', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      "grant_type": "password",
      "client_id": CLIENT_ID,
      "client_secret": SECRET,
      "email": TESLA_EMAIL,
      "password": TESLA_PASSWORD,
    })
  });

  const accessTokenResponse = await fetch(request)
  const accessTokenJSON = await accessTokenResponse.json()

  await storeAccessToken(accessTokenJSON)

  return accessTokenJSON.access_token
}

async function accessTokenFromRefreshToken() {
  headers = new Headers()
  headers.set('Content-Type', 'application/json')

  let refreshToken = await TESLA.get('refresh-token')
  if (refreshToken === null) {
    throw 'No refresh token found'
  }

  console.log('Refreshing token')
  const request = new Request('https://owner-api.teslamotors.com/oauth/token', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      "grant_type": "refresh_token",
      "client_id": CLIENT_ID,
      "client_secret": SECRET,
      "refresh_token": refreshToken
    })
  });

  const accessTokenResponse = await fetch(request)
  const accessTokenJSON = await accessTokenResponse.json()

  await storeAccessToken(accessTokenJSON)

  return accessTokenJSON.access_token
}

async function storeAccessToken(accessTokenJSON) {
  if (accessTokenJSON.access_token) {
    console.log('Storing access token')
    await TESLA.put('access-token', accessTokenJSON.access_token)
    await TESLA.put('refresh-token', accessTokenJSON.refresh_token)
    return accessTokenJSON.access_token
  } else {
    console.log('Could not refresh access token', accessTokenJSON)
    await TESLA.delete('refresh-token')
    throw 'Could not refresh access token'
  }
}

async function getVehicleIDFromVin() {
  const storedVehicleID = await TESLA.get('vehicle-id')

  if (storedVehicleID) {
    return storedVehicleID
  } else {
    console.log('Getting vehicle list')
    headers = await teslaHeaders()
    const request = new Request("https://owner-api.teslamotors.com/api/1/vehicles", {
      method: 'GET',
      headers: headers,
    });

    const vehiclesResponse = await fetch(request)
    const vehiclesJSON = await vehiclesResponse.json()
    const vehicleID = vehiclesJSON.response.find(vehicle => vehicle.vin === VIN).id_s

    if (vehicleID) {
      await TESLA.put('vehicle-id', vehicleID)
      return vehicleID
    } else {
      throw 'Cannot find vehicle with that VIN'
    }
  }
}

async function startHVAC() {
  headers = await teslaHeaders()

  console.log('Starting HVAC')
  const hvacResponse = await teslaRequest('POST', '/command/auto_conditioning_start')

  console.log('HVAC command response:' + await hvacResponse.text())
  return hvacResponse
}

async function setTemperature(temperature) {
  headers = await teslaHeaders()
  headers.set('Content-Type', 'application/json')

  console.log('Setting Temperature')
  const setTemps = await teslaRequest('POST', '/command/set_temps', {
    driver_temp: temperature,
    passenger_temp: temperature
  })

  console.log('Set temperature command response:' + await setTemps.text())
  return setTemps
}

async function setSeatHeater(seatNumber, seatLevel) {
  const setSeatHeater = await teslaRequest('POST', '/command/remote_seat_heater_request', {
    heater: seatNumber,
    level: seatLevel
  })

  console.log('Set seat heater command response:' + await setSeatHeater.text())
  return setSeatHeater
}

async function wakeVehicle() {
  headers = await teslaHeaders()

  console.log('Waking car')
  const wakeResponse = await teslaRequest('POST', '/wake_up')
  const wakeResponseJSON = await wakeResponse.json()

  let vehicleAwake = false

  if (wakeResponse.status == 200 && wakeResponseJSON.response.state === 'online') {
    console.log('Car already awake, skipping polling')
    vehicleAwake = true
  }

  let loopCount = 1

  while (vehicleAwake === false) {
    console.log('Checking for awake. Try: ' + loopCount)

    if (loopCount > 60) {
      throw 'Timed out waiting for car to wake up (60s).'
    }

    const stateResponse = await teslaRequest('GET', '/vehicle_data', null, true)
    const stateResponseJSON = await stateResponse.json()

    const currentState = stateResponseJSON.response ? stateResponseJSON.response.state : 'unknown'
    console.log('Current state: ' + currentState)

    if (wakeResponse.status === 200 && currentState === 'online') {
      vehicleAwake = true
    } else {
      console.log('Car is sleeping, trying again in 1s')
      loopCount += 1
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function teslaRequest(method, url, body = null, allowFailure = false) {
  headers = await teslaHeaders()

  if (body !== null) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(body)
  }

  const vehicleID = await TESLA.get('vehicle-id')

  if (!vehicleID) {
    throw 'No vehicle ID found, did you set a VIN?'
  }

  const fullUrl = "https://owner-api.teslamotors.com/api/1/vehicles/" + vehicleID + url
  console.log('Calling: ' + method + ' ' + fullUrl + ' with body: ' + body)

  const request = new Request(fullUrl, {
    method: method,
    headers: headers,
    body: body
  });

  const response = await fetch(request)

  console.log('Response status:', response.status)

  if (response.status === 404) {
    console.log('Returning 404, clearing out the vehicle-id as they can change sometime')
    await TESLA.delete('vehicle-id')
  }

  if (response.status === 401) {
    console.log('Access token invalid, clearing access token')
    await TESLA.delete('access-token')

    try {
      await accessTokenFromRefreshToken()
    } catch (e) {
      console.log('Cannot get access token, trying again.')
    }
  }

  if (allowFailure || response.status === 200) {
    return response
  } else {
    throw 'Invalid response: ' + (await response.text())
  }
}
