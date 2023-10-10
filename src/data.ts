import { errorDisplayer } from "./error.js";
import { mergeQueryParams } from "./queryParams.js";
import { clearTable, insertRow } from "./table.js";

const form = document.querySelector("#intersect-input-form") as HTMLFormElement

const url = new URL(document.URL)

const POINT_X_URL_ID = "pointX"
const POINT_Y_URL_ID = "pointY"
const SCALE_URL_ID = "scale"

const DEBOUNCE_TIME = 400

const API_ORIGIN = url.origin
const API_BASE = ""
const API_INTERSECT_ENDPOINT = "/app"
const INVALID_DATA_ERROR_CODE = 422
const MAX_FLOAT_INPUT_LENGTH = 15

type TPoint = {
  x: number,
  y: number,
  scale: number
}

const urlParams: TPoint = {
  x: Number(url.searchParams.get(POINT_X_URL_ID)),
  y: Number(url.searchParams.get(POINT_Y_URL_ID)),
  scale: Number(url.searchParams.get(SCALE_URL_ID))
}

const xValues = [-3, -2, -1, 0, 1, 2, 3, 4, 5]

type AreaCheckResult = {
  point: TPoint,
  result: boolean,
  calculationTime: number,
  calculatedAt: number
}

type AreaCheckResponse = {
  user: {
    points: AreaCheckResult[]
  }
}

class Point {
  private static DEFAULT_X = 0
  private static DEFAULT_Y = 0
  
  #x: number = Point.DEFAULT_X
  #y: number = Point.DEFAULT_Y

  getX() {
    return this.#x
  }

  getY() {
    return this.#y
  }

  constructor(x?: number, y?: number) {
    this.setX(x)
    this.setY(y)
  }

  setX(x?: number) {
    if (x === undefined || x === null) {
      this.#x = Point.DEFAULT_X
      return;
    }

    const val = closeToValueInSet(x, xValues)
    if (val === undefined) {
      throw new Error(`X should be one of ${xValues.join(" ")}`)
    }

    this.#x = val;

  }

  setY(y?: number) {
    if (y == undefined || y == null) {
      this.#y = Point.DEFAULT_Y
      return;
    }

    if (!(-3 <= y && y <= 5)) {
      throw new Error(`Should be number in range [-3, 5]. Got ${y}`)
    }

    this.#y = y;
  }
}

const scaleValues = [1, 1.5, 2, 2.5, 3]
class FormData {
  public point: Point
  public scale: number = 1
  
  constructor({x, y, scale = 1}: TPoint) {
    this.point = new Point(x, y) ?? new Point()
    this.setScale(scale);
  }

  setScale(scale: number) {
    const val = closeToValueInSet(scale, scaleValues)

    if (val === undefined) {
      throw new Error(`Should be one of the following: ${scaleValues.join(" ")}`)
    }

    this.scale = val
  }
}

function closeToValueInSet(value: number, valueSet: number[]) {
  for (const possibleValue of valueSet) {
    if (Math.abs(possibleValue - value) <= 0.25) {
      return possibleValue;
    }
  }
}

const formData = new FormData(urlParams)
const pointXInput = form.querySelector("#input-point-x") as HTMLInputElement
pointXInput.value = formData.point.getX().toString()
pointXInput.addEventListener("input", onNumberInput(DEBOUNCE_TIME, (value) => {
  formData.point.setX(value)
  updateUrl(formData)
}))

const pointYInput = form.querySelector("#input-point-y")! as HTMLInputElement
pointYInput.value = formData.point.getY().toString()
pointYInput.addEventListener("input", onNumberInput(DEBOUNCE_TIME, (value) => {
  formData.point.setY(value)
  updateUrl(formData)
}))

function onNumberInput(debounceMs: number, callback: (value: number) => void) {
  return debounce((event: Event) => {
    const input = event.target as HTMLInputElement
    const value = Number(input.value)
  
    if (input.value.length != 0 && Number.isNaN(value)) {
      displayError(`Should be number like 1.123, got ${input.value}`, input)
      return;
    }
  
    if (input.value.length > MAX_FLOAT_INPUT_LENGTH) {
      displayError(`Too large Y input. Try shorter numbers`, input)
      return;
    }
  
    input.setCustomValidity("")
    
    if (input.value.length === 0) {
      return;
    }
  
    try {
      callback(value)
    } catch (e) {
      const error = e as Error
      displayError(error.message, input)
    }
  }, debounceMs)
}

function displayError(message: string = "Something went wrong! Please contact the developer", element?: HTMLInputElement) {
  element?.setCustomValidity(message)
  errorDisplayer.push(new Error(message))
}


const scaleInput = form.querySelector("#scale-input") as HTMLDivElement

const checkboxes = scaleInput.querySelectorAll(`scale > input[type="checkbox"]`) as NodeListOf<HTMLInputElement>

updateCheckbox(checkboxes, formData.scale.toString())
updateUrl(formData)

scaleInput.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  if (event.target.type !== "checkbox") {
    return;
  }

  const { target } = event
  const scale = Number(target.value)
  formData.scale = scale;

  updateCheckbox(checkboxes, target.value)

  updateUrl(formData)
})

form.addEventListener("submit", event => {
  event.preventDefault()

  const request = new XMLHttpRequest()
  const tableBody = document.querySelector("#results-table > tbody") as HTMLTableElement
  const url = new URL(API_BASE + API_INTERSECT_ENDPOINT, API_ORIGIN)
  const params = buildQueryParams(formData)
  mergeQueryParams(url.searchParams, params)
  url.searchParams.set("isJson", "")
  
  request.open("GET", url)
  request.send()
  request.addEventListener("load", response => {
    if (request.status !== 200) {
      if (request.status === INVALID_DATA_ERROR_CODE) {
        displayError("Invalid data! Check input")
        return;
      }
      displayError()
      return;
    }
    
    clearTable(tableBody)

    const { points } = (JSON.parse(request.responseText) as AreaCheckResponse).user;
    points.reverse()
    for (const {point, result, calculatedAt, calculationTime} of points) {
      insertRow(tableBody, point.x.toString(), point.y.toString(), point.scale.toString(), result.toString(), new Date(calculatedAt).toLocaleTimeString("ru-RU"), calculationTime.toString())
    }
  })
})

function updateUrl(formData: FormData) {
  const queryParams = buildQueryParams(formData)

  const url = new URL(document.URL)
  mergeQueryParams(url.searchParams, queryParams)

  window.history.replaceState({}, "", url)

}

function buildQueryParams(formData: FormData) {
  const url = new URLSearchParams()
  
  url.set(POINT_X_URL_ID, formData.point.getX().toString())
  url.set(POINT_Y_URL_ID, formData.point.getY().toString())
  url.set(SCALE_URL_ID, formData.scale.toString())

  return url
}

function updateCheckbox(checkboxes: NodeListOf<HTMLInputElement>, value: string) {
  checkboxes.forEach(checkbox => {
    if (checkbox.value === value) {
      checkbox.checked = true
      return;
    }

    checkbox.checked = false
  })
}

function debounce<T extends Function>(callback: T, timeoutMs: number) {
  let timerId: number | undefined = undefined

  return ((...args: any) => {
    window.clearTimeout(timerId)
    timerId = setTimeout(() => callback(...args), timeoutMs) as unknown as number
  })
}
