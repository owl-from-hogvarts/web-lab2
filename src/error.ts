

const ERROR_HIDE_TIMEOUT = 4000

class ErrorDisplayer {
  // readonly #errors: DisplayedError[] = [];
  readonly #errorsContainer;

  constructor(errorsContainer: HTMLElement) {
    this.#errorsContainer = errorsContainer;
  }

  push(error: Error) {
    const errorElement = createErrorElement(error)
    this.#errorsContainer.appendChild(errorElement)
    setTimeout(() => {
      this.#errorsContainer.removeChild(errorElement)
    }, ERROR_HIDE_TIMEOUT)
  }
}

function createErrorElement(error: Error) {
  const errorElement = document.createElement("error")
  errorElement.classList.add("rounded")
  errorElement.textContent = error.message

  return errorElement
}

export const errorDisplayer = new ErrorDisplayer(document.querySelector("modal > errors-container")!)
