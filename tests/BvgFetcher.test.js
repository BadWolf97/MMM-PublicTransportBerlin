const assert = require("node:assert/strict");
const {after, describe, it, mock} = require("node:test");
const Module = require("node:module");

const loggerMock = {
  debug: mock.fn(),
  info: mock.fn(),
  warn: mock.fn(),
  error: mock.fn(),
  log: mock.fn()
};

/* eslint-disable no-underscore-dangle */
const originalLoad = Module._load.bind(Module);
Module._load = (request, parent, isMain) => {
  if (request === "logger") {
    return loggerMock;
  }
  return originalLoad(request, parent, isMain);
};

after(() => {
  Module._load = originalLoad;
});
/* eslint-enable no-underscore-dangle */

const BvgFetcher = require("../BvgFetcher");

globalThis.config = {logLevel: "INFO"};

function createRow (overrides = {}) {
  return {
    when: "2026-05-13T10:00:00.000Z",
    plannedWhen: "2026-05-13T10:00:00.000Z",
    delay: 0,
    cancelled: false,
    direction: "Central Station",
    line: {
      name: "U5",
      nr: "5",
      product: "subway"
    },
    stop: {
      id: "900100003"
    },
    ...overrides
  };
}

function createFetcher (configOverrides = {}) {
  return new BvgFetcher({
    identifier: "test-fetcher",
    stationId: "900100003",
    excludedTransportationTypes: [],
    ignoredLines: [],
    excludeDirections: [],
    shortenStationNames: false,
    ...configOverrides
  });
}

describe("BvgFetcher processData excludeDirections", () => {
  it("filters out departures with excluded directions", () => {
    const fetcher = createFetcher({excludeDirections: ["Central Station"]});
    const data = {
      departures: [
        createRow({direction: "Central Station"}),
        createRow({
          direction: "Airport",
          line: {
            name: "U8",
            nr: "8",
            product: "subway"
          }
        })
      ]
    };

    const result = fetcher.processData(data);

    assert.equal(result.departuresArray.length, 1);
    assert.equal(result.departuresArray[0].direction, "Airport");
  });

  it("keeps all departures when excludeDirections is empty", () => {
    const fetcher = createFetcher({excludeDirections: []});
    const data = {
      departures: [
        createRow({direction: "Central Station"}),
        createRow({
          direction: "Airport",
          line: {
            name: "U8",
            nr: "8",
            product: "subway"
          }
        })
      ]
    };

    const result = fetcher.processData(data);

    assert.equal(result.departuresArray.length, 2);
  });

  it("matches directions case-sensitively", () => {
    const fetcher = createFetcher({excludeDirections: ["airport"]});
    const data = {
      departures: [createRow({direction: "Airport"})]
    };

    const result = fetcher.processData(data);

    assert.equal(result.departuresArray.length, 1);
    assert.equal(result.departuresArray[0].direction, "Airport");
  });

  it("still applies ignoredLines together with excludeDirections", () => {
    const fetcher = createFetcher({
      ignoredLines: ["U5"],
      excludeDirections: ["Airport"]
    });
    const data = {
      departures: [
        createRow({
          line: {
            name: "U5",
            nr: "5",
            product: "subway"
          },
          direction: "Central Station"
        }),
        createRow({
          line: {
            name: "U8",
            nr: "8",
            product: "subway"
          },
          direction: "Airport"
        }),
        createRow({
          line: {
            name: "M10",
            nr: "10",
            product: "tram"
          },
          direction: "City Center"
        })
      ]
    };

    const result = fetcher.processData(data);

    assert.equal(result.departuresArray.length, 1);
    assert.equal(result.departuresArray[0].name, "M10");
    assert.equal(result.departuresArray[0].direction, "City Center");
  });
});

describe("BvgFetcher processData filters", () => {
  it("filters out excluded transportation types", () => {
    const fetcher = createFetcher({excludedTransportationTypes: ["bus"]});
    const data = {
      departures: [
        createRow({
          line: {
            name: "Bus 200",
            nr: "200",
            product: "bus"
          }
        }),
        createRow({
          line: {
            name: "U5",
            nr: "5",
            product: "subway"
          },
          direction: "Airport"
        })
      ]
    };

    const result = fetcher.processData(data);

    assert.equal(result.departuresArray.length, 1);
    assert.equal(result.departuresArray[0].type, "subway");
  });

  it("filters out ignored lines", () => {
    const fetcher = createFetcher({ignoredLines: ["M10"]});
    const data = {
      departures: [
        createRow({
          line: {
            name: "M10",
            nr: "10",
            product: "tram"
          }
        }),
        createRow({
          line: {
            name: "U8",
            nr: "8",
            product: "subway"
          },
          direction: "Airport"
        })
      ]
    };

    const result = fetcher.processData(data);

    assert.equal(result.departuresArray.length, 1);
    assert.equal(result.departuresArray[0].name, "U8");
  });
});

describe("BvgFetcher processData ordering", () => {
  it("sorts departures by time ascending", () => {
    const fetcher = createFetcher();
    const data = {
      departures: [
        createRow({when: "2026-05-13T10:30:00.000Z"}),
        createRow({
          when: "2026-05-13T10:10:00.000Z",
          line: {
            name: "U8",
            nr: "8",
            product: "subway"
          }
        }),
        createRow({
          when: "2026-05-13T10:20:00.000Z",
          line: {
            name: "M10",
            nr: "10",
            product: "tram"
          }
        })
      ]
    };

    const result = fetcher.processData(data);

    assert.deepEqual(
      result.departuresArray.map((departure) => departure.when),
      [
        "2026-05-13T10:10:00.000Z",
        "2026-05-13T10:20:00.000Z",
        "2026-05-13T10:30:00.000Z"
      ]
    );
  });
});

describe("BvgFetcher processData field mapping", () => {
  it("uses plannedWhen as fallback when when is missing", () => {
    const fetcher = createFetcher();
    const data = {
      departures: [
        createRow({
          when: null,
          plannedWhen: "2026-05-13T11:00:00.000Z"
        })
      ]
    };

    const result = fetcher.processData(data);

    assert.equal(result.departuresArray.length, 1);
    assert.equal(result.departuresArray[0].when, "2026-05-13T11:00:00.000Z");
  });

  it("maps delay and cancelled defaults", () => {
    const fetcher = createFetcher();
    const data = {
      departures: [
        createRow({
          delay: null,
          cancelled: null
        })
      ]
    };

    const result = fetcher.processData(data);

    assert.equal(result.departuresArray[0].delay, 0);
    assert.equal(result.departuresArray[0].cancelled, false);
  });

  it("returns fetcher identifier in result payload", () => {
    const fetcher = createFetcher({identifier: "module_1"});
    const data = {
      departures: [createRow()]
    };

    const result = fetcher.processData(data);

    assert.equal(result.fetcherId, "module_1");
  });
});

describe("BvgFetcher compareTimes", () => {
  it("returns -1 when first departure is earlier", () => {
    const result = BvgFetcher.compareTimes(
      {when: "2026-05-13T10:00:00.000Z"},
      {when: "2026-05-13T10:05:00.000Z"}
    );

    assert.equal(result, -1);
  });

  it("returns 1 when first departure is later", () => {
    const result = BvgFetcher.compareTimes(
      {when: "2026-05-13T10:10:00.000Z"},
      {when: "2026-05-13T10:05:00.000Z"}
    );

    assert.equal(result, 1);
  });

  it("returns 0 when times are equal", () => {
    const result = BvgFetcher.compareTimes(
      {when: "2026-05-13T10:05:00.000Z"},
      {when: "2026-05-13T10:05:00.000Z"}
    );

    assert.equal(result, 0);
  });
});

describe("BvgFetcher fetchDepartures option building", () => {
  it("requests departures without direction when directionStationId is empty", async () => {
    const fetcher = createFetcher({
      directionStationId: "",
      departureMinutes: 30,
      travelTimeToStation: 0
    });

    let capturedOptions;
    fetcher.hafasClient = {
      departures: (_stationId, options) => {
        capturedOptions = options;
        return Promise.resolve({departures: []});
      }
    };
    fetcher.processData = () => ({
      fetcherId: "x",
      departuresArray: []
    });

    await fetcher.fetchDepartures();

    assert.equal("direction" in capturedOptions, false);
    assert.equal(capturedOptions.duration, 30);
  });

  it("requests departures with direction when directionStationId is set", async () => {
    const fetcher = createFetcher({
      directionStationId: "900100001",
      departureMinutes: 20,
      travelTimeToStation: 5
    });

    let capturedOptions;
    fetcher.hafasClient = {
      departures: (_stationId, options) => {
        capturedOptions = options;
        return Promise.resolve({departures: []});
      }
    };
    fetcher.processData = () => ({
      fetcherId: "x",
      departuresArray: []
    });

    await fetcher.fetchDepartures();

    assert.equal(capturedOptions.direction, "900100001");
    assert.equal(capturedOptions.duration, 20);
  });
});
