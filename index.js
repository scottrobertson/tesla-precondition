addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})

/**
 * Main API Endpoint. Waits for car to wake up, and then sets the temprature and starts HVAC.
 * @param {Request} request
 */
async function handleRequest(request) {
  const accessToken = request.headers.get('X-Tesla-access_token')
  const vin = request.headers.get('X-Tesla-vin')
  const temperature = request.headers.get('X-Tesla-temp')
  const seats = request.headers.get('X-Tesla-seats')

  let successMessage = 'Car is preconditioning'

  try {
    const vehicleID = await getVehicleIDFromVin(accessToken, vin)

    await wakeVehicle(accessToken, vehicleID)
    await startHVAC(accessToken, vehicleID)

    if (temperature) {
      await setTemperature(accessToken, vehicleID, temperature)
      successMessage += ` to ${temperature}C`
    }

    // Enable seat heaters
    if (seats) {
      await Promise.all(
        seats.split(',').map(async (seatLevel, seatNumber) => {
          await setSeatHeater(accessToken, vehicleID, seatNumber, seatLevel)
        }),
      )
      successMessage += ', and the seats have been set.'
    }

    return jsonResponse(successMessage)
  } catch (errorMessage) {
    return jsonResponse('Error: ' + errorMessage)
  }
}

async function jsonResponse(message) {
  return new Response(JSON.stringify({ response: message }), {
    headers: { 'content-type': 'application/json' },
  })
}

async function getVehicleIDFromVin(accessToken, vin) {
  if (vin === null) {
    throw 'No X-Tesla-vin header provided'
  }

  console.log('Getting vehicle list')

  const vehiclesResponse = await teslaRequest(accessToken, null, 'GET', '/vehicles')
  const vehiclesJSON = await vehiclesResponse.json()
  const vehicleID = vehiclesJSON.response.find((vehicle) => vehicle.vin === vin).id_s

  if (vehicleID) {
    return vehicleID
  } else {
    throw 'Cannot find vehicle with that VIN'
  }
}

async function startHVAC(accessToken, vehicleID) {
  console.log('Starting HVAC')
  const hvacResponse = await teslaRequest(accessToken, vehicleID, 'POST', '/command/auto_conditioning_start')

  console.log('HVAC command response:' + (await hvacResponse.text()))
  return hvacResponse
}

async function setTemperature(accessToken, vehicleID, temperature) {
  console.log('Setting Temperature')
  const setTemps = await teslaRequest(accessToken, vehicleID, 'POST', '/command/set_temps', {
    driver_temp: temperature,
    passenger_temp: temperature,
  })

  console.log('Set temperature command response:' + (await setTemps.text()))
  return setTemps
}

async function setSeatHeater(accessToken, vehicleID, seatNumber, seatLevel) {
  const setSeatHeater = await teslaRequest(accessToken, vehicleID, 'POST', '/command/remote_seat_heater_request', {
    heater: seatNumber,
    level: seatLevel,
  })

  console.log('Set seat heater command response:' + (await setSeatHeater.text()))
  return setSeatHeater
}

async function wakeVehicle(accessToken, vehicleID) {
  console.log('Waking car')
  const wakeResponse = await teslaRequest(accessToken, vehicleID, 'POST', '/wake_up')
  const wakeResponseJSON = await wakeResponse.json()
  console.log(`Vehicle state: ${wakeResponseJSON.response.state}`)
}

async function teslaRequest(accessToken, vehicleID, method, url, body = null) {
  if (accessToken === null) {
    throw 'No access token provided'
  }

  const headers = new Headers()
  headers.set('Authorization', 'Bearer ' + accessToken)

  if (body !== null) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(body)
  }

  let fullUrl = null
  if (vehicleID === null && url === '/vehicles') {
    fullUrl = 'https://owner-api.teslamotors.com/api/1/vehicles/'
  } else {
    fullUrl = 'https://owner-api.teslamotors.com/api/1/vehicles/' + vehicleID + url
  }

  console.log('Calling: ' + method + ' ' + fullUrl + ' with body: ' + body)
  const request = new Request(fullUrl, {
    method: method,
    headers: headers,
    body: body,
  })

  let response = await fetch(request)
  console.log('Response status:', response.status)

  let retryCount = 1
  let retryMs = 1000
  let retryLimit = 60

  while (response.status === 408) {
    if (retryCount > retryLimit) {
      throw `Timed out waiting for car to wake up (${retryMs}ms).`
    }

    console.log(`[Attempt: ${retryCount}/${retryLimit}] Car is sleeping, trying again in ${retryMs}ms`)
    await new Promise((r) => setTimeout(r, retryMs))

    response = await fetch(request)
    console.log('Response status:', response.status)

    retryCount += 1
  }

  if (response.status === 401) {
    throw 'Access Token invalid'
  }

  if (response.status === 200) {
    return response
  } else {
    throw `Invalid response from ${fullUrl}: [${response.status}] ` + (await response.text())
  }
}
