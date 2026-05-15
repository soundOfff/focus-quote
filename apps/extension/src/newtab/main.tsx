import { render } from "preact"
import "../main-fonts"
import "../styles/tailwind.css"
import { App } from "./App"

const root = document.getElementById("root")
if (root) render(<App />, root)
