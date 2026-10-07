import { mount } from "svelte";
import "../app.css";
import Bootstrap from "./Bootstrap.svelte";

mount(Bootstrap, { target: document.getElementById("app")! });
