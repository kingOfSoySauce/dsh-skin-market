window.__ModuleLoader__.load({
	id: "dsh-skin-market",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		_deepseek_ai_dsh_client_ui_primitives = __toESM(_deepseek_ai_dsh_client_ui_primitives, 1);
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region node_modules/@phosphor-icons/react/dist/defs/SquaresFour.es.js
		const e$2 = /* @__PURE__ */ new Map([
			["bold", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M100,36H56A20,20,0,0,0,36,56v44a20,20,0,0,0,20,20h44a20,20,0,0,0,20-20V56A20,20,0,0,0,100,36ZM96,96H60V60H96ZM200,36H156a20,20,0,0,0-20,20v44a20,20,0,0,0,20,20h44a20,20,0,0,0,20-20V56A20,20,0,0,0,200,36Zm-4,60H160V60h36Zm-96,40H56a20,20,0,0,0-20,20v44a20,20,0,0,0,20,20h44a20,20,0,0,0,20-20V156A20,20,0,0,0,100,136Zm-4,60H60V160H96Zm104-60H156a20,20,0,0,0-20,20v44a20,20,0,0,0,20,20h44a20,20,0,0,0,20-20V156A20,20,0,0,0,200,136Zm-4,60H160V160h36Z" }))],
			["duotone", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", {
				d: "M112,56v48a8,8,0,0,1-8,8H56a8,8,0,0,1-8-8V56a8,8,0,0,1,8-8h48A8,8,0,0,1,112,56Zm88-8H152a8,8,0,0,0-8,8v48a8,8,0,0,0,8,8h48a8,8,0,0,0,8-8V56A8,8,0,0,0,200,48Zm-96,96H56a8,8,0,0,0-8,8v48a8,8,0,0,0,8,8h48a8,8,0,0,0,8-8V152A8,8,0,0,0,104,144Zm96,0H152a8,8,0,0,0-8,8v48a8,8,0,0,0,8,8h48a8,8,0,0,0,8-8V152A8,8,0,0,0,200,144Z",
				opacity: "0.2"
			}), /* @__PURE__ */ react.createElement("path", { d: "M200,136H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Zm0,64H152V152h48v48ZM104,40H56A16,16,0,0,0,40,56v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,104,40Zm0,64H56V56h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,64H152V56h48v48Zm-96,32H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm0,64H56V152h48v48Z" }))],
			["fill", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M120,56v48a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40h48A16,16,0,0,1,120,56Zm80-16H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm-96,96H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm96,0H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Z" }))],
			["light", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M104,42H56A14,14,0,0,0,42,56v48a14,14,0,0,0,14,14h48a14,14,0,0,0,14-14V56A14,14,0,0,0,104,42Zm2,62a2,2,0,0,1-2,2H56a2,2,0,0,1-2-2V56a2,2,0,0,1,2-2h48a2,2,0,0,1,2,2Zm94-62H152a14,14,0,0,0-14,14v48a14,14,0,0,0,14,14h48a14,14,0,0,0,14-14V56A14,14,0,0,0,200,42Zm2,62a2,2,0,0,1-2,2H152a2,2,0,0,1-2-2V56a2,2,0,0,1,2-2h48a2,2,0,0,1,2,2Zm-98,34H56a14,14,0,0,0-14,14v48a14,14,0,0,0,14,14h48a14,14,0,0,0,14-14V152A14,14,0,0,0,104,138Zm2,62a2,2,0,0,1-2,2H56a2,2,0,0,1-2-2V152a2,2,0,0,1,2-2h48a2,2,0,0,1,2,2Zm94-62H152a14,14,0,0,0-14,14v48a14,14,0,0,0,14,14h48a14,14,0,0,0,14-14V152A14,14,0,0,0,200,138Zm2,62a2,2,0,0,1-2,2H152a2,2,0,0,1-2-2V152a2,2,0,0,1,2-2h48a2,2,0,0,1,2,2Z" }))],
			["regular", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M104,40H56A16,16,0,0,0,40,56v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,104,40Zm0,64H56V56h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,64H152V56h48v48Zm-96,32H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm0,64H56V152h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Zm0,64H152V152h48v48Z" }))],
			["thin", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M104,44H56A12,12,0,0,0,44,56v48a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V56A12,12,0,0,0,104,44Zm4,60a4,4,0,0,1-4,4H56a4,4,0,0,1-4-4V56a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4Zm92-60H152a12,12,0,0,0-12,12v48a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V56A12,12,0,0,0,200,44Zm4,60a4,4,0,0,1-4,4H152a4,4,0,0,1-4-4V56a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4ZM104,140H56a12,12,0,0,0-12,12v48a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V152A12,12,0,0,0,104,140Zm4,60a4,4,0,0,1-4,4H56a4,4,0,0,1-4-4V152a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4Zm92-60H152a12,12,0,0,0-12,12v48a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V152A12,12,0,0,0,200,140Zm4,60a4,4,0,0,1-4,4H152a4,4,0,0,1-4-4V152a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4Z" }))]
		]);
		//#endregion
		//#region node_modules/@phosphor-icons/react/dist/defs/TShirt.es.js
		const e$1 = /* @__PURE__ */ new Map([
			["bold", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M246.17,57.9,198.09,29.65h0A11.9,11.9,0,0,0,192,28H160a12,12,0,0,0-12,12,20,20,0,0,1-40,0A12,12,0,0,0,96,28H64a11.9,11.9,0,0,0-6.07,1.66h0L9.83,57.9A20.18,20.18,0,0,0,2,84l17.9,36.8A19.62,19.62,0,0,0,37.67,132H52v76a20,20,0,0,0,20,20H184a20,20,0,0,0,20-20V132h14.32a19.64,19.64,0,0,0,17.75-11.17L254,84A20.18,20.18,0,0,0,246.17,57.9ZM40.37,108,25.16,76.73,52,61v47ZM180,204H76V52h9.67a44,44,0,0,0,84.68,0H180Zm35.62-96H204V61l26.83,15.76Z" }))],
			["duotone", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", {
				d: "M247.11,78.77l-19.27,36.81a8.44,8.44,0,0,1-7.5,4.42H192V40l51.78,28.25A7.81,7.81,0,0,1,247.11,78.77Zm-238.22,0,19.27,36.81a8.44,8.44,0,0,0,7.5,4.42H64V40L12.22,68.25A7.81,7.81,0,0,0,8.89,78.77Z",
				opacity: "0.2"
			}), /* @__PURE__ */ react.createElement("path", { d: "M247.59,61.22,195.83,33A8,8,0,0,0,192,32H160a8,8,0,0,0-8,8,24,24,0,0,1-48,0,8,8,0,0,0-8-8H64a8,8,0,0,0-3.84,1L8.41,61.22A15.76,15.76,0,0,0,1.82,82.48l19.27,36.81A16.37,16.37,0,0,0,35.67,128H56v80a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16V128h20.34a16.37,16.37,0,0,0,14.58-8.71l19.27-36.81A15.76,15.76,0,0,0,247.59,61.22ZM35.67,112a.62.62,0,0,1-.41-.13L16.09,75.26,56,53.48V112ZM184,208H72V48h16.8a40,40,0,0,0,78.38,0H184Zm36.75-96.14a.55.55,0,0,1-.41.14H200V53.48l39.92,21.78Z" }))],
			["fill", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M247.59,61.22,195.83,33A8,8,0,0,0,192,32H160a8,8,0,0,0-8,8,24,24,0,0,1-48,0,8,8,0,0,0-8-8H64a8,8,0,0,0-3.84,1L8.41,61.22A15.76,15.76,0,0,0,1.82,82.48l19.27,36.81A16.37,16.37,0,0,0,35.67,128H56v80a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16V128h20.34a16.37,16.37,0,0,0,14.58-8.71l19.27-36.81A15.76,15.76,0,0,0,247.59,61.22ZM35.67,112a.62.62,0,0,1-.41-.13L16.09,75.26,56,53.48V112Zm185.07-.14a.55.55,0,0,1-.41.14H200V53.48l39.92,21.78Z" }))],
			["light", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M246.64,63,194.87,34.74A5.93,5.93,0,0,0,192,34H160a6,6,0,0,0-6,6,26,26,0,0,1-52,0,6,6,0,0,0-6-6H64a5.93,5.93,0,0,0-2.88.74L9.36,63A13.77,13.77,0,0,0,3.58,81.55l19.28,36.81A14.38,14.38,0,0,0,35.67,126H58v82a14,14,0,0,0,14,14H184a14,14,0,0,0,14-14V126h22.34a14.38,14.38,0,0,0,12.81-7.64l19.28-36.81A13.77,13.77,0,0,0,246.64,63Zm-211,51a2.42,2.42,0,0,1-2.18-1.21L14.21,76a1.82,1.82,0,0,1,.9-2.47L58,50.11V114ZM186,208a2,2,0,0,1-2,2H72a2,2,0,0,1-2-2V46H90.48a38,38,0,0,0,75,0H186Zm55.8-132-19.28,36.8a2.42,2.42,0,0,1-2.18,1.21H198V50.11l42.9,23.4A1.83,1.83,0,0,1,241.79,76Z" }))],
			["regular", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M247.59,61.22,195.83,33A8,8,0,0,0,192,32H160a8,8,0,0,0-8,8,24,24,0,0,1-48,0,8,8,0,0,0-8-8H64a8,8,0,0,0-3.84,1L8.41,61.22A15.76,15.76,0,0,0,1.82,82.48l19.27,36.81A16.37,16.37,0,0,0,35.67,128H56v80a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16V128h20.34a16.37,16.37,0,0,0,14.58-8.71l19.27-36.81A15.76,15.76,0,0,0,247.59,61.22ZM35.67,112a.62.62,0,0,1-.41-.13L16.09,75.26,56,53.48V112ZM184,208H72V48h16.8a40,40,0,0,0,78.38,0H184Zm36.75-96.14a.55.55,0,0,1-.41.14H200V53.48l39.92,21.78Z" }))],
			["thin", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M245.68,64.73,193.91,36.49h0A4,4,0,0,0,192,36H160a4,4,0,0,0-4,4,28,28,0,0,1-56,0,4,4,0,0,0-4-4H64a4,4,0,0,0-1.9.5h0L10.32,64.73a11.79,11.79,0,0,0-5,15.89l19.28,36.81a12.37,12.37,0,0,0,11,6.57H60v84a12,12,0,0,0,12,12H184a12,12,0,0,0,12-12V124h24.33a12.37,12.37,0,0,0,11-6.57l19.28-36.81A11.79,11.79,0,0,0,245.68,64.73ZM35.67,116a4.46,4.46,0,0,1-4-2.28L12.44,76.91a3.79,3.79,0,0,1,1.71-5.15L60,46.74V116ZM188,208a4,4,0,0,1-4,4H72a4,4,0,0,1-4-4V44H92.22a36,36,0,0,0,71.56,0H188ZM243.56,76.91l-19.27,36.81a4.46,4.46,0,0,1-4,2.28H196V46.74l45.85,25A3.79,3.79,0,0,1,243.56,76.91Z" }))]
		]);
		//#endregion
		//#region node_modules/@phosphor-icons/react/dist/defs/X.es.js
		const a = /* @__PURE__ */ new Map([
			["bold", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z" }))],
			["duotone", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", {
				d: "M216,56V200a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40H200A16,16,0,0,1,216,56Z",
				opacity: "0.2"
			}), /* @__PURE__ */ react.createElement("path", { d: "M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" }))],
			["fill", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM181.66,170.34a8,8,0,0,1-11.32,11.32L128,139.31,85.66,181.66a8,8,0,0,1-11.32-11.32L116.69,128,74.34,85.66A8,8,0,0,1,85.66,74.34L128,116.69l42.34-42.35a8,8,0,0,1,11.32,11.32L139.31,128Z" }))],
			["light", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M204.24,195.76a6,6,0,1,1-8.48,8.48L128,136.49,60.24,204.24a6,6,0,0,1-8.48-8.48L119.51,128,51.76,60.24a6,6,0,0,1,8.48-8.48L128,119.51l67.76-67.75a6,6,0,0,1,8.48,8.48L136.49,128Z" }))],
			["regular", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" }))],
			["thin", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M202.83,197.17a4,4,0,0,1-5.66,5.66L128,133.66,58.83,202.83a4,4,0,0,1-5.66-5.66L122.34,128,53.17,58.83a4,4,0,0,1,5.66-5.66L128,122.34l69.17-69.17a4,4,0,1,1,5.66,5.66L133.66,128Z" }))]
		]);
		//#endregion
		//#region node_modules/@phosphor-icons/react/dist/lib/context.es.js
		const o = (0, react.createContext)({
			color: "currentColor",
			size: "1em",
			weight: "regular",
			mirrored: !1
		});
		//#endregion
		//#region node_modules/@phosphor-icons/react/dist/lib/IconBase.es.js
		const p = react.forwardRef((s, a) => {
			const { alt: n, color: r, size: t, weight: o$1, mirrored: c, children: i, weights: m, ...x } = s, { color: d = "currentColor", size: l, weight: f = "regular", mirrored: g = !1, ...w } = react.useContext(o);
			return /* @__PURE__ */ react.createElement("svg", {
				ref: a,
				xmlns: "http://www.w3.org/2000/svg",
				width: t != null ? t : l,
				height: t != null ? t : l,
				fill: r != null ? r : d,
				viewBox: "0 0 256 256",
				transform: c || g ? "scale(-1, 1)" : void 0,
				...w,
				...x
			}, !!n && /* @__PURE__ */ react.createElement("title", null, n), i, m.get(o$1 != null ? o$1 : f));
		});
		p.displayName = "IconBase";
		//#endregion
		//#region node_modules/@phosphor-icons/react/dist/csr/SquaresFour.es.js
		const r$1 = react.forwardRef((e, a) => /* @__PURE__ */ react.createElement(p, {
			ref: a,
			...e,
			weights: e$2
		}));
		r$1.displayName = "SquaresFourIcon";
		//#endregion
		//#region node_modules/@phosphor-icons/react/dist/csr/TShirt.es.js
		const r = react.forwardRef((t, e) => /* @__PURE__ */ react.createElement(p, {
			ref: e,
			...t,
			weights: e$1
		}));
		r.displayName = "TShirtIcon";
		//#endregion
		//#region node_modules/@phosphor-icons/react/dist/csr/X.es.js
		const e = react.forwardRef((r, t) => /* @__PURE__ */ react.createElement(p, {
			ref: t,
			...r,
			weights: a
		}));
		e.displayName = "XIcon";
		//#endregion
		//#region node_modules/@primer/octicons-react/dist/renderOcticon-DuMQdmQC.mjs
		function _typeof(o) {
			"@babel/helpers - typeof";
			return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
				return typeof o;
			} : function(o) {
				return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
			}, _typeof(o);
		}
		var _excluded = [
			"aria-hidden",
			"aria-label",
			"aria-labelledby",
			"tabIndex",
			"className",
			"fill",
			"size",
			"verticalAlign",
			"id",
			"title",
			"style"
		];
		function _extends() {
			return _extends = Object.assign ? Object.assign.bind() : function(n) {
				for (var e = 1; e < arguments.length; e++) {
					var t = arguments[e];
					for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
				}
				return n;
			}, _extends.apply(null, arguments);
		}
		function ownKeys(e, r) {
			var t = Object.keys(e);
			if (Object.getOwnPropertySymbols) {
				var o = Object.getOwnPropertySymbols(e);
				r && (o = o.filter(function(r) {
					return Object.getOwnPropertyDescriptor(e, r).enumerable;
				})), t.push.apply(t, o);
			}
			return t;
		}
		function _objectSpread(e) {
			for (var r = 1; r < arguments.length; r++) {
				var t = null != arguments[r] ? arguments[r] : {};
				r % 2 ? ownKeys(Object(t), !0).forEach(function(r) {
					_defineProperty(e, r, t[r]);
				}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r) {
					Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
				});
			}
			return e;
		}
		function _defineProperty(e, r, t) {
			return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
				value: t,
				enumerable: !0,
				configurable: !0,
				writable: !0
			}) : e[r] = t, e;
		}
		function _toPropertyKey(t) {
			var i = _toPrimitive(t, "string");
			return "symbol" == _typeof(i) ? i : i + "";
		}
		function _toPrimitive(t, r) {
			if ("object" != _typeof(t) || !t) return t;
			var e = t[Symbol.toPrimitive];
			if (void 0 !== e) {
				var i = e.call(t, r || "default");
				if ("object" != _typeof(i)) return i;
				throw new TypeError("@@toPrimitive must return a primitive value.");
			}
			return ("string" === r ? String : Number)(t);
		}
		function _objectWithoutProperties(e, t) {
			if (null == e) return {};
			var o, r, i = _objectWithoutPropertiesLoose(e, t);
			if (Object.getOwnPropertySymbols) {
				var n = Object.getOwnPropertySymbols(e);
				for (r = 0; r < n.length; r++) o = n[r], -1 === t.indexOf(o) && {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]);
			}
			return i;
		}
		function _objectWithoutPropertiesLoose(r, e) {
			if (null == r) return {};
			var t = {};
			for (var n in r) if ({}.hasOwnProperty.call(r, n)) {
				if (-1 !== e.indexOf(n)) continue;
				t[n] = r[n];
			}
			return t;
		}
		var sizeMap = {
			small: 16,
			medium: 32,
			large: 64
		};
		function renderOcticon(_ref, forwardedRef, defaultClassName, svgDataByHeight, heights) {
			var ariaHidden = _ref["aria-hidden"], ariaLabel = _ref["aria-label"], arialabelledby = _ref["aria-labelledby"], tabIndex = _ref.tabIndex, _ref$className = _ref.className, className = _ref$className === void 0 ? "" : _ref$className, _ref$fill = _ref.fill, fill = _ref$fill === void 0 ? "currentColor" : _ref$fill, _ref$size = _ref.size, size = _ref$size === void 0 ? 16 : _ref$size, _ref$verticalAlign = _ref.verticalAlign, verticalAlign = _ref$verticalAlign === void 0 ? "text-bottom" : _ref$verticalAlign, id = _ref.id, title = _ref.title, style = _ref.style, rest = _objectWithoutProperties(_ref, _excluded);
			var height = sizeMap[size] || size;
			var naturalHeight = closestNaturalHeight(heights, height);
			var naturalWidth = svgDataByHeight[naturalHeight].width;
			var width = height * (naturalWidth / naturalHeight);
			var path = svgDataByHeight[naturalHeight].path;
			var labelled = ariaLabel || arialabelledby;
			var computedAriaHidden = ariaHidden === void 0 ? labelled ? void 0 : "true" : ariaHidden;
			var role = labelled && computedAriaHidden !== "true" ? "img" : void 0;
			return /*#__PURE__*/ react.default.createElement("svg", _extends({
				ref: forwardedRef,
				"data-component": "Octicon"
			}, rest, {
				"aria-hidden": computedAriaHidden,
				tabIndex,
				focusable: tabIndex >= 0 ? "true" : "false",
				"aria-label": ariaLabel,
				"aria-labelledby": arialabelledby,
				className: "".concat(defaultClassName, " ").concat(className).trim(),
				role,
				viewBox: "0 0 ".concat(naturalWidth, " ").concat(naturalHeight),
				width,
				height,
				fill,
				id,
				display: "inline-block",
				overflow: "visible",
				style: _objectSpread({ verticalAlign }, style)
			}), title ? /*#__PURE__*/ react.default.createElement("title", null, title) : null, path);
		}
		function closestNaturalHeight(naturalHeights, height) {
			return naturalHeights.map(function(naturalHeight) {
				return parseInt(naturalHeight, 10);
			}).reduce(function(acc, naturalHeight) {
				return naturalHeight <= height ? naturalHeight : acc;
			}, naturalHeights[0]);
		}
		//#endregion
		//#region node_modules/@primer/octicons-react/dist/icons/MarkGithubIcon.mjs
		var heights$1 = ["16", "24"];
		var svgDataByHeight$1 = {
			"16": {
				"width": 16,
				"path": /*#__PURE__*/ react.default.createElement("path", { d: "M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" })
			},
			"24": {
				"width": 24,
				"path": /*#__PURE__*/ react.default.createElement("path", { d: "M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943" })
			}
		};
		var MarkGithubIcon = /*#__PURE__*/ react.default.forwardRef(function(props, ref) {
			return renderOcticon(props, ref, "octicon octicon-mark-github", svgDataByHeight$1, heights$1);
		});
		MarkGithubIcon.displayName = "MarkGithubIcon";
		//#endregion
		//#region node_modules/@primer/octicons-react/dist/icons/StarIcon.mjs
		var heights = ["16", "24"];
		var svgDataByHeight = {
			"16": {
				"width": 16,
				"path": /*#__PURE__*/ react.default.createElement("path", { d: "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z" })
			},
			"24": {
				"width": 24,
				"path": /*#__PURE__*/ react.default.createElement("path", { d: "M12 .25a.75.75 0 0 1 .673.418l3.058 6.197 6.839.994a.75.75 0 0 1 .415 1.279l-4.948 4.823 1.168 6.811a.751.751 0 0 1-1.088.791L12 18.347l-6.117 3.216a.75.75 0 0 1-1.088-.79l1.168-6.812-4.948-4.823a.75.75 0 0 1 .416-1.28l6.838-.993L11.328.668A.75.75 0 0 1 12 .25Zm0 2.445L9.44 7.882a.75.75 0 0 1-.565.41l-5.725.832 4.143 4.038a.748.748 0 0 1 .215.664l-.978 5.702 5.121-2.692a.75.75 0 0 1 .698 0l5.12 2.692-.977-5.702a.748.748 0 0 1 .215-.664l4.143-4.038-5.725-.831a.75.75 0 0 1-.565-.41L12 2.694Z" })
			}
		};
		var StarIcon = /*#__PURE__*/ react.default.forwardRef(function(props, ref) {
			return renderOcticon(props, ref, "octicon octicon-star", svgDataByHeight, heights);
		});
		StarIcon.displayName = "StarIcon";
		//#endregion
		//#region \0dsh-skin-market-css:/Users/leon/Code/liang-intensity-calibrator/code/dsh-skin-market/src/client/SkinMarket.module.css.mjs
		const css = ".VqXecW_root{box-sizing:border-box;width:100%;height:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);display:block;position:relative;overflow:hidden}.VqXecW_home{overscroll-behavior:contain;background:var(--dsw-alias-bg-layer-2);scrollbar-gutter:stable;-webkit-overflow-scrolling:touch;width:100%;height:100%;min-height:0;overflow-y:auto}.VqXecW_home[hidden],.VqXecW_browser[hidden]{display:none!important}.VqXecW_homeHeader{z-index:8;border-bottom:1px solid var(--dsw-alias-border-l2);background:color-mix(in srgb, var(--dsw-alias-bg-layer-2) 94%, transparent);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);gap:14px;padding:22px 24px 16px;display:grid;position:sticky;top:0}.VqXecW_homeHeader>span{height:44px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;align-items:center;gap:8px;padding:0 14px;display:flex}.VqXecW_homeHeader>span:focus-within{border-color:var(--dsw-alias-border-l1)}.VqXecW_homeHeader>span input{min-width:0;color:var(--dsw-alias-label-primary);background:0 0;border:0;outline:0;flex:1}.VqXecW_homeHeader>span input::placeholder{color:var(--dsw-alias-label-caption)}.VqXecW_homeTitleRow{justify-content:space-between;align-items:center;gap:16px;min-width:0;display:flex}.VqXecW_homeTitleRow h2,.VqXecW_homeTitleRow p,.VqXecW_homeSectionTitle h3{margin:0}.VqXecW_homeTitleRow h2{font-size:20px;font-weight:600;line-height:28px}.VqXecW_homeTitleRow p{color:var(--dsw-alias-label-secondary);margin-top:2px;font-size:12px;line-height:18px}.VqXecW_homeActions{align-items:center;gap:8px;display:flex}.VqXecW_homeContent{gap:30px;padding:24px 24px 38px;display:grid}.VqXecW_homeSection{min-width:0}.VqXecW_homeSectionTitle{justify-content:space-between;align-items:center;gap:14px;min-height:28px;margin-bottom:12px;display:flex}.VqXecW_homeSectionTitle h3{font-size:15px;font-weight:600;line-height:22px}.VqXecW_homeSectionTitle>span{color:var(--dsw-alias-label-caption);font-size:11px;line-height:17px}.VqXecW_installedRow{grid-template-columns:repeat(var(--installed-columns), minmax(0, 1fr));gap:12px;display:grid;overflow:hidden}.VqXecW_homeCard{box-sizing:border-box;cursor:pointer;text-align:left;width:100%;min-width:0;height:auto;min-height:0;color:inherit;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);font:inherit;border-radius:10px;flex-direction:column;padding:0;display:flex;position:relative;overflow:hidden}.VqXecW_homeCard:hover{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-interactive-bg-hover)}.VqXecW_homeCard[data-active=true]{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 4%, var(--dsw-alias-bg-layer-1))}.VqXecW_homeCardOpen{width:100%;min-width:0;color:inherit;text-align:left;background:0 0;border:0;flex-direction:column;flex:1;align-items:stretch;padding:0;display:flex}.VqXecW_homeCardMedia{background:var(--dsw-alias-bg-layer-2);flex:none;width:100%;height:clamp(118px,13vw,174px);max-height:174px;display:block;overflow:hidden}.VqXecW_homeCardMedia>img,.VqXecW_homeCardMedia>.VqXecW_previewPlaceholder{object-fit:cover;object-position:center;width:100%;height:100%;display:block}.VqXecW_homeCardCopy{box-sizing:border-box;gap:6px;width:100%;min-width:0;padding:12px 14px 10px;display:grid}.VqXecW_homeCardTitleRow{justify-content:space-between;align-items:center;gap:8px;min-width:0;display:flex}.VqXecW_homeCardTitleRow>strong{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-size:13px;font-weight:550;line-height:19px;overflow:hidden}.VqXecW_homeCardCopy>small{min-width:0;color:var(--dsw-alias-label-caption);justify-content:space-between;align-items:center;gap:8px;font-size:11px;line-height:18px;display:flex}.VqXecW_homeCardCopy>small>span:first-child{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.VqXecW_feedMeta{white-space:nowrap;flex:none;align-items:center;gap:4px;display:inline-flex}.VqXecW_cardInlineActions{z-index:2;align-items:center;gap:2px;display:flex;position:absolute;bottom:7px;right:10px}.VqXecW_homeCard[data-actions=\"1\"] .VqXecW_homeCardCopy>small{padding-right:38px}.VqXecW_homeCard[data-actions=\"2\"] .VqXecW_homeCardCopy>small{padding-right:74px}.VqXecW_root .VqXecW_cardAction{height:22px;min-height:22px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:0;border-radius:5px;justify-content:center;align-items:center;padding:0 6px;font-size:11px;line-height:18px;display:inline-flex}.VqXecW_root .VqXecW_cardAction:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.VqXecW_root .VqXecW_cardAction:disabled{cursor:default;color:var(--dsw-alias-label-dimmed);background:0 0}.VqXecW_cardActionProgress{min-height:22px;color:var(--dsw-alias-label-caption);align-items:center;gap:4px;padding:0 6px;font-size:11px;line-height:18px;display:inline-flex}.VqXecW_cardActionProgress svg{width:13px;height:13px;animation:1s linear infinite VqXecW_spin}.VqXecW_installedMoreCard{min-height:0;color:var(--dsw-alias-label-secondary);text-align:center;background:0 0;justify-content:center;align-items:center;gap:9px}.VqXecW_installedMoreCard strong{font-size:13px;font-weight:550;line-height:19px}.VqXecW_installedEmpty{min-height:110px;color:var(--dsw-alias-label-secondary);border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;place-items:center;font-size:12px;line-height:18px;display:grid}.VqXecW_discoveryGrid{columns:4;column-gap:12px}.VqXecW_discoveryGrid .VqXecW_homeCard{break-inside:avoid;margin:0 0 12px;display:inline-flex}.VqXecW_installedRow .VqXecW_homeCardMedia{height:clamp(106px,11vw,148px);max-height:148px}.VqXecW_discoveryGrid .VqXecW_homeCard[data-feed-size=\"1\"] .VqXecW_homeCardMedia{height:clamp(142px,16vw,206px);max-height:206px}.VqXecW_discoveryGrid .VqXecW_homeCard[data-feed-size=\"2\"] .VqXecW_homeCardMedia{height:clamp(130px,14.5vw,190px);max-height:190px}.VqXecW_homeLoading{min-height:220px;color:var(--dsw-alias-label-secondary);justify-content:center;align-items:center;gap:7px;font-size:13px;line-height:20px;display:flex}.VqXecW_homeLoading svg{animation:1s linear infinite VqXecW_spin}.VqXecW_homeLoadMore{gap:6px;padding:2px 8px 0;display:grid}.VqXecW_homeLoadMore span{background:var(--dsw-alias-bg-layer-1);border-radius:4px;height:4px;display:block}.VqXecW_homeLoadMore span:first-child{width:72%}.VqXecW_homeLoadMore span:last-child{width:46%}.VqXecW_homeError{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-tertiary);border-radius:8px;margin-top:12px;padding:10px 12px;font-size:12px;line-height:18px}.VqXecW_browser{z-index:1000;background:0 0;place-items:center;padding:60px;display:grid;position:fixed;inset:0;overflow:hidden}.VqXecW_browserBackdrop{cursor:default;background:var(--dsw-alias-bg-mask-1);width:100%;height:100%;-webkit-backdrop-filter:var(--dsw-mask-blur);backdrop-filter:var(--dsw-mask-blur);border:0;padding:0;position:absolute;inset:0}.VqXecW_browserPanel{z-index:1;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:18px;grid-template-rows:48px minmax(0,1fr);grid-template-columns:300px minmax(0,1fr);width:min(1080px,100vw - 120px);min-width:0;height:min(720px,100vh - 120px);min-height:0;display:grid;position:relative;overflow:hidden;box-shadow:0 28px 90px #000000b3,0 0 0 1px #ffffff06}.VqXecW_browserTitlebar{border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);grid-column:1/-1;justify-content:space-between;align-items:center;gap:16px;min-width:0;padding:0 14px 0 18px;display:flex}.VqXecW_browserTitlebar>span{align-items:baseline;gap:9px;min-width:0;display:flex}.VqXecW_browserTitlebar strong{flex:none;font-size:13px;font-weight:600;line-height:20px}.VqXecW_browserTitlebar small{min-width:0;color:var(--dsw-alias-label-caption);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:18px;overflow:hidden}.VqXecW_browserClose{flex:none}.VqXecW_browserHomeBack{align-self:flex-start;display:none}.VqXecW_settingsNavIcon{flex:none;justify-content:center;align-items:center;width:16px;height:16px;display:inline-flex}.VqXecW_settingsNavIcon svg{width:16px;height:16px;display:block}svg[data-dsh-skin-market-default-icon=hidden]{display:none}.VqXecW_srOnly{clip:rect(0, 0, 0, 0)!important;white-space:nowrap!important;border:0!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;position:absolute!important;overflow:hidden!important}.VqXecW_catalog{border-right:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);flex-direction:column;min-width:0;min-height:0;display:flex}.VqXecW_catalogHeader{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:14px;padding:24px 22px 10px;display:flex}.VqXecW_catalogHeader h2,.VqXecW_detail h2,.VqXecW_detail h3,.VqXecW_catalogHeader p,.VqXecW_detail p{margin:0}.VqXecW_catalogHeader h2{margin-bottom:2px;font-size:20px;font-weight:600;line-height:28px}.VqXecW_catalogHeader p{color:var(--dsw-alias-label-secondary);margin-top:2px;font-size:12px;line-height:18px}.VqXecW_catalogTitle{justify-content:space-between;align-items:center;gap:12px;display:flex}.VqXecW_catalogTitleMain{align-items:center;gap:7px;min-width:0;display:flex}.VqXecW_root .VqXecW_marketUpdateButton{border-radius:8px;justify-content:center;align-items:center;width:28px;min-width:28px;height:28px;min-height:28px;padding:0;transition:width .14s;display:inline-flex;overflow:hidden}.VqXecW_marketUpdateLabel{white-space:nowrap;display:none}.VqXecW_root .VqXecW_marketUpdateButton:hover,.VqXecW_root .VqXecW_marketUpdateButton:focus-visible,.VqXecW_root .VqXecW_marketUpdateButton[data-updating=true]{width:50px}.VqXecW_root .VqXecW_marketUpdateButton:hover svg,.VqXecW_root .VqXecW_marketUpdateButton:focus-visible svg,.VqXecW_root .VqXecW_marketUpdateButton[data-updating=true] svg{display:none}.VqXecW_root .VqXecW_marketUpdateButton:hover .VqXecW_marketUpdateLabel,.VqXecW_root .VqXecW_marketUpdateButton:focus-visible .VqXecW_marketUpdateLabel,.VqXecW_root .VqXecW_marketUpdateButton[data-updating=true] .VqXecW_marketUpdateLabel{display:inline}.VqXecW_catalogHeader>span{height:48px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);background:0 0;border-radius:10px;align-items:center;gap:8px;padding:0 14px;display:flex}.VqXecW_catalogHeader>span:focus-within{border-color:var(--dsw-alias-border-l1)}.VqXecW_catalogHeader>span input{min-width:0;color:var(--dsw-alias-label-primary);background:0 0;border:0;outline:0;flex:1}.VqXecW_catalogHeader>span input::placeholder{color:var(--dsw-alias-label-caption)}.VqXecW_filterBar{justify-content:space-between;align-items:center;gap:8px;display:flex}.VqXecW_filters{flex-wrap:wrap;gap:4px;display:flex}.VqXecW_root .VqXecW_filters .VqXecW_filterPill{border-radius:14px;justify-content:center;align-items:center;height:28px;padding:0 11px;font-size:12px;line-height:18px;display:inline-flex;color:var(--dsw-alias-label-secondary)!important;background:0 0!important;border:1px solid #0000!important}.VqXecW_root .VqXecW_filters .VqXecW_filterPill:hover{background:var(--dsw-alias-interactive-bg-hover)!important}.VqXecW_root .VqXecW_filters .VqXecW_filterPill[data-active=true]{color:var(--dsw-alias-label-primary)!important;border-color:var(--dsw-alias-button-ghost-active-border,var(--dsw-alias-border-l1))!important;background:var(--dsw-alias-button-ghost-active-fill,var(--dsw-alias-interactive-bg-hover))!important}.VqXecW_staticPill{height:24px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:none;border-radius:12px;align-items:center;gap:4px;padding:0 8px;font-size:12px;line-height:18px;display:inline-flex}.VqXecW_sortButton{cursor:pointer;white-space:nowrap;height:28px;color:var(--dsw-alias-label-secondary);background:0 0;border:0;border-radius:14px;justify-content:center;align-items:center;gap:4px;padding:0 10px;font-size:12px;line-height:18px;display:inline-flex}.VqXecW_sortButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.VqXecW_skinList{overscroll-behavior:contain;scrollbar-gutter:stable;touch-action:pan-y;-webkit-overflow-scrolling:touch;flex-direction:column;flex:1 1 0;gap:4px;height:0;min-height:0;margin:0;padding:8px 12px 16px;display:flex;overflow:hidden auto}.VqXecW_skinCard{box-sizing:border-box;cursor:pointer;text-align:left;width:100%;min-height:72px;color:inherit;font:inherit;background:0 0;border:0;border-radius:8px;align-items:center;gap:12px;padding:8px;display:flex}.VqXecW_skinCard:hover{background:var(--dsw-specific-sidebar-nav-item-hover,var(--dsw-alias-interactive-bg-hover))}.VqXecW_externalPlugin{cursor:default;border:1px dashed var(--dsw-alias-border-l2);min-height:58px}.VqXecW_skinCard[data-selected=true]{background:var(--dsw-specific-sidebar-nav-item-active,var(--dsw-alias-button-ghost-active-fill));box-shadow:inset 0 0 0 1px var(--dsw-alias-button-ghost-active-border)}.VqXecW_skinCard>img{object-fit:cover;opacity:.35;background:var(--dsw-alias-bg-layer-3);border-radius:7px;flex:none;width:56px;height:56px;transition:opacity .18s ease-out;display:block}.VqXecW_skinCard>img[data-loaded=true]{opacity:1}.VqXecW_previewPlaceholder{box-sizing:border-box;min-width:0;color:var(--dsw-alias-label-caption);background:linear-gradient(145deg, var(--dsw-alias-bg-layer-2), var(--dsw-alias-bg-layer-1));text-align:center;flex-direction:column;justify-content:center;align-items:center;gap:4px;display:flex;overflow:hidden}.VqXecW_previewPlaceholder strong{max-width:88%;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:500;line-height:18px;display:block;overflow:hidden}.VqXecW_previewPlaceholder small{color:var(--dsw-alias-label-caption);font-size:10px;line-height:15px}.VqXecW_previewPlaceholder[data-preview-kind=list]{border-radius:7px;flex:none;width:56px;height:56px}.VqXecW_previewPlaceholder[data-preview-kind=list] strong{font-size:9px;line-height:12px}.VqXecW_previewPlaceholder[data-preview-kind=list] small{display:none}.VqXecW_skinCardBody{flex-direction:column;flex:1;min-width:0;display:flex}.VqXecW_cardTitle{white-space:nowrap;text-overflow:ellipsis;font-size:14px;font-weight:400;line-height:22px;overflow:hidden}.VqXecW_cardMetaLine{min-width:0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));align-items:center;gap:8px;font-size:12px;line-height:18px;display:flex}.VqXecW_cardMeta{white-space:nowrap;text-overflow:ellipsis;min-width:0;overflow:hidden}.VqXecW_cardStars{white-space:nowrap;flex:none;align-items:center;gap:3px;display:inline-flex}.VqXecW_cardStatus{height:20px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));background:var(--dsw-alias-bg-layer-1);white-space:nowrap;border:0;border-radius:5px;flex:none;align-items:center;padding:0 7px;font-size:10px;line-height:16px;display:inline-flex}.VqXecW_cardStatusUpdate{color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary));background:color-mix(in srgb, var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary)) 10%, transparent)}.VqXecW_cardStatusActive{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent)}.VqXecW_listSkeleton{gap:4px;display:grid}.VqXecW_skeletonCard{align-items:center;gap:12px;min-height:72px;padding:8px;display:flex}.VqXecW_skeletonCard>span:first-child{border-radius:7px;flex:none;width:56px;height:56px}.VqXecW_skeletonCard>span:nth-child(2){flex:1;gap:8px;min-width:0;display:grid}.VqXecW_skeletonCard>span:nth-child(2) i:first-child{width:62%;height:14px}.VqXecW_skeletonCard>span:nth-child(2) i:last-child{width:42%;height:10px}.VqXecW_skeletonCard>i{border-radius:5px;width:42px;height:18px}.VqXecW_skeletonCard span:first-child,.VqXecW_skeletonCard i,.VqXecW_detailSkeleton span,.VqXecW_detailSkeleton i,.VqXecW_loadMoreHint span{background:linear-gradient(90deg, var(--dsw-alias-bg-layer-1) 25%, var(--dsw-alias-interactive-bg-hover) 50%, var(--dsw-alias-bg-layer-1) 75%);background-size:200% 100%;border-radius:6px;animation:1.4s ease-in-out infinite VqXecW_skeletonShimmer;display:block}.VqXecW_loadMoreHint{gap:6px;padding:10px 8px 2px;display:grid}.VqXecW_loadMoreHint span{height:4px}.VqXecW_loadMoreHint span:first-child{width:72%}.VqXecW_loadMoreHint span:last-child{width:46%}.VqXecW_detailSkeleton{gap:16px;display:grid}.VqXecW_detailSkeleton>div{gap:20px;display:flex}.VqXecW_detailSkeleton>div span{border-radius:9px;flex:none;width:138px;height:138px}.VqXecW_detailSkeleton>div i{width:min(420px,58%);height:72px;margin-top:12px}.VqXecW_detailSkeleton>span{width:100%;height:42px}.VqXecW_detailSkeleton>span:nth-child(3){height:min(340px,34vh)}.VqXecW_detailSkeleton>span:last-child{width:76%;height:110px}.VqXecW_detail{flex-direction:column;gap:14px;min-width:0;min-height:0;padding:32px 28px 28px;display:flex;overflow-y:auto}.VqXecW_detail>*{flex:none}.VqXecW_mobileBack.VqXecW_nativeOutline{order:0;align-self:flex-start;display:none}.VqXecW_hero{aspect-ratio:16/8;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;order:4;width:100%;position:relative;overflow:hidden}.VqXecW_hero img{object-fit:cover;width:100%;height:100%;display:block}.VqXecW_hero>.VqXecW_previewPlaceholder{width:100%;height:100%}.VqXecW_hero>.VqXecW_previewPlaceholder strong{font-size:16px;line-height:24px}.VqXecW_thumbnails{order:5;gap:8px;display:flex;overflow-x:auto}.VqXecW_thumbnails button{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);opacity:.62;background:0 0;border-radius:8px;flex:none;width:112px;padding:0;overflow:hidden}.VqXecW_thumbnails button[data-selected=true]{border-color:var(--dsw-alias-brand-primary);opacity:1}.VqXecW_thumbnails img{aspect-ratio:16/9;object-fit:cover;width:100%;display:block}.VqXecW_thumbnails .VqXecW_previewPlaceholder{aspect-ratio:16/9;width:100%}.VqXecW_detailHeader{border-bottom:1px solid var(--dsw-alias-border-l2);order:1;grid-template-columns:138px minmax(0,1fr);align-items:start;gap:22px;padding:0 4px 16px;display:grid}.VqXecW_skinAvatar{background:var(--dsw-alias-bg-layer-1);border-radius:9px;width:138px;height:138px;display:block;overflow:hidden}.VqXecW_skinAvatar>img,.VqXecW_skinAvatar>.VqXecW_previewPlaceholder{object-fit:cover;width:100%;height:100%;display:block}.VqXecW_titleBlock{min-width:0;padding-top:10px}.VqXecW_titleBlock h2{letter-spacing:-.01em;font-size:23px;font-weight:620;line-height:31px}.VqXecW_titleBlock .VqXecW_author{color:var(--dsw-alias-label-secondary);margin-top:2px;font-size:13px;line-height:20px}.VqXecW_titleBlock .VqXecW_description{max-width:520px;color:var(--dsw-alias-label-secondary);margin-top:10px;font-size:13px;line-height:21px}.VqXecW_titleBlock .VqXecW_version{min-width:0;color:var(--dsw-alias-label-caption);align-items:center;gap:7px;margin-top:8px;font-size:12px;line-height:22px;display:flex}.VqXecW_status{height:20px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);white-space:nowrap;border:0;border-radius:10px;align-items:center;padding:0 7px;font-size:11px;line-height:18px;display:inline-flex}.VqXecW_statusActive{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent)}.VqXecW_actionRow{border-bottom:1px solid var(--dsw-alias-border-l2);flex-wrap:wrap;order:2;align-items:center;gap:9px;min-height:42px;padding:0 4px 12px;display:flex}.VqXecW_installOptions{gap:12px;display:grid}.VqXecW_installOptions>div{gap:6px;display:grid}.VqXecW_installOptions strong{font-size:12px;font-weight:550}.VqXecW_copyCapsule{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:17px;align-items:center;min-width:0;padding-left:12px;display:flex}.VqXecW_copyCapsule code{min-width:0;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;flex:1;font:11px/32px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;overflow:hidden}.VqXecW_copyCapsule .VqXecW_copyCapsuleButton{border-width:0 0 0 1px;border-radius:0 16px 16px 0;flex:none;min-width:32px;height:32px;padding:0 8px}.VqXecW_stars{color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none;align-items:center;gap:5px;font-size:12px;line-height:20px;display:inline-flex}.VqXecW_actionDivider{background:var(--dsw-alias-border-l2);width:1px;height:22px;margin:0 3px}.VqXecW_repoMeta{flex:220px;align-items:center;gap:10px;min-width:0;display:flex}.VqXecW_repoLink{min-width:0;color:var(--dsw-alias-link-primary,var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary)));align-items:center;gap:5px;font-size:12px;line-height:20px;text-decoration:none;display:inline-flex}.VqXecW_repoLink>svg{flex:none}.VqXecW_repoLink>span{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.VqXecW_repoLink:hover{text-decoration:underline}.VqXecW_nativePrimary,.VqXecW_nativeOutline{cursor:pointer;height:28px;font:inherit;border-radius:14px;justify-content:center;align-items:center;gap:4px;padding:0 10px;font-size:12px;line-height:18px;display:inline-flex}.VqXecW_nativePrimary{color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-label-primary-inverted,#fff));background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));border:0}.VqXecW_nativePrimary:hover{background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary))}.VqXecW_nativeOutline{color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);background:0 0}.VqXecW_nativeOutline:hover{background:var(--dsw-alias-interactive-bg-hover)}.VqXecW_iconOnlyButton{width:28px;padding:0}.VqXecW_compactActionIcon svg{width:14px;height:14px}.VqXecW_operation,.VqXecW_error{border-radius:10px;order:3;align-items:center;gap:7px;padding:9px 12px;font-size:12px;line-height:18px;display:flex}.VqXecW_operation{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}.VqXecW_operation svg{animation:1s linear infinite VqXecW_spin}.VqXecW_error{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-tertiary)}.VqXecW_aboutGrid{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;order:6;grid-template-columns:minmax(0,1fr) minmax(260px,1fr);display:grid}.VqXecW_aboutGrid>*{padding:16px 18px}.VqXecW_aboutGrid>aside{border-left:1px solid var(--dsw-alias-border-l2)}.VqXecW_aboutGrid h3,.VqXecW_recommendations h3{margin-bottom:10px;font-size:14px;font-weight:600;line-height:22px}.VqXecW_aboutGrid article>p{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:21px}.VqXecW_tags{flex-wrap:wrap;gap:6px;margin-top:12px;display:flex}.VqXecW_aboutGrid dl{margin:12px 0 0}.VqXecW_aboutGrid dl div{border-bottom:1px solid var(--dsw-alias-border-l3);justify-content:space-between;gap:12px;padding:7px 0;font-size:12px;line-height:18px;display:flex}.VqXecW_aboutGrid dt{color:var(--dsw-alias-label-caption)}.VqXecW_aboutGrid dd{text-align:right;color:var(--dsw-alias-label-secondary);margin:0}.VqXecW_notice{color:var(--dsw-alias-state-warning-primary);font-size:11px;line-height:17px;margin-top:10px!important}.VqXecW_changelog ol{gap:8px;margin:0 0 12px;padding:0;list-style:none;display:grid}.VqXecW_changelog li{color:var(--dsw-alias-label-secondary);grid-template-columns:64px minmax(0,1fr);gap:10px;font-size:12px;line-height:18px;display:grid}.VqXecW_changelog strong{color:var(--dsw-alias-label-caption);font-weight:500}.VqXecW_changelog a{color:var(--dsw-alias-label-primary);font-size:12px;text-decoration:none}.VqXecW_changelog a:hover{text-decoration:underline}.VqXecW_healthList span[data-health=pass]{color:var(--dsw-alias-state-success-primary,#2f9e63)}.VqXecW_healthList span[data-health=improve]{color:var(--dsw-alias-state-warning-primary)}.VqXecW_healthSuggestion{color:var(--dsw-alias-label-secondary);margin:8px 0 0;font-size:11px;line-height:17px}.VqXecW_collectionTitle{border-top:1px solid var(--dsw-alias-border-l3);margin-top:18px;padding-top:14px}.VqXecW_recommendations{border-top:1px solid var(--dsw-alias-border-l2);order:7;padding-top:18px}.VqXecW_recommendations>div{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;display:grid}.VqXecW_recommendations button{cursor:pointer;text-align:left;width:100%;min-width:0;height:auto;min-height:0;color:inherit;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);font:inherit;border-radius:10px;flex-direction:column;align-self:start;padding:0;display:flex;overflow:hidden}.VqXecW_recommendations button:hover{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-interactive-bg-hover)}.VqXecW_recommendations img{aspect-ratio:16/9;object-fit:contain;background:var(--dsw-alias-bg-layer-2);width:100%;display:block}.VqXecW_recommendations .VqXecW_previewPlaceholder{aspect-ratio:16/9;width:100%}.VqXecW_recommendations button>span{box-sizing:border-box;justify-content:space-between;align-items:flex-start;gap:10px;width:100%;padding:11px 12px 12px;display:flex}.VqXecW_recommendations strong{white-space:normal;overflow-wrap:anywhere;min-width:0;font-size:13px;line-height:19px}.VqXecW_recommendations small{color:var(--dsw-alias-label-caption);flex:none;align-items:center;gap:3px;padding-top:1px;font-size:11px;line-height:18px;display:inline-flex}.VqXecW_loading,.VqXecW_listLoading,.VqXecW_empty{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.VqXecW_loading{align-items:center;gap:7px;margin:auto;display:flex}.VqXecW_listLoading{justify-content:center;align-items:center;gap:7px;padding:24px 8px;display:flex}.VqXecW_loading svg,.VqXecW_listLoading svg{animation:1s linear infinite VqXecW_spin}.VqXecW_empty{text-align:center;padding:24px 8px}.VqXecW_submission{gap:10px;width:100%;min-width:0;max-width:100%;display:grid}.VqXecW_submission small{color:var(--dsw-alias-label-caption);margin:0;font-size:12px;line-height:18px}.VqXecW_submission textarea{box-sizing:border-box;resize:vertical;width:100%;min-width:0;max-width:100%;min-height:300px;color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;outline:none;padding:12px;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.VqXecW_submission textarea:focus{border-color:var(--dsw-alias-brand-primary)}@keyframes VqXecW_spin{to{transform:rotate(360deg)}}@keyframes VqXecW_skeletonShimmer{to{background-position:-200% 0}}@media (prefers-reduced-motion:reduce){.VqXecW_root .VqXecW_marketUpdateButton{transition:none}.VqXecW_skeletonCard span:first-child,.VqXecW_skeletonCard i,.VqXecW_detailSkeleton span,.VqXecW_detailSkeleton i,.VqXecW_loadMoreHint span{animation:none}.VqXecW_skinCard>img{transition:none}.VqXecW_homeLoading svg{animation:none}}@media (width<=1099px) and (width>=960px){.VqXecW_discoveryGrid{columns:3}}@media (width<=959px){.VqXecW_root{height:100%;min-height:0;max-height:100%;display:block;overflow:hidden}.VqXecW_homeHeader{padding:18px 16px 14px}.VqXecW_homeContent{gap:24px;padding:20px 16px 30px}.VqXecW_homeSectionTitle>span{display:none}.VqXecW_discoveryGrid{columns:2;column-gap:10px}.VqXecW_discoveryGrid .VqXecW_homeCard{margin-bottom:10px}.VqXecW_homeCardCopy{padding:9px 12px 10px}.VqXecW_homeCardCopy>small{flex-direction:row;align-items:center;gap:6px}.VqXecW_homeCardMedia{height:112px;max-height:112px}.VqXecW_installedRow .VqXecW_homeCardMedia{height:104px;max-height:104px}.VqXecW_discoveryGrid .VqXecW_homeCard[data-feed-size=\"1\"] .VqXecW_homeCardMedia{height:148px;max-height:148px}.VqXecW_discoveryGrid .VqXecW_homeCard[data-feed-size=\"2\"] .VqXecW_homeCardMedia{height:130px;max-height:130px}.VqXecW_cardInlineActions{right:8px}.VqXecW_browser{background:var(--dsw-alias-bg-layer-2);-webkit-backdrop-filter:none;backdrop-filter:none;padding:0;display:block}.VqXecW_browserBackdrop,.VqXecW_browserTitlebar{display:none}.VqXecW_browserPanel{width:100%;height:100%;box-shadow:none;border:0;border-radius:0;display:block}.VqXecW_browserHomeBack.VqXecW_nativeOutline{display:inline-flex}.VqXecW_catalog{border-right:0;height:100%;min-height:0;overflow:hidden}.VqXecW_detail{overscroll-behavior:contain;-webkit-overflow-scrolling:touch;height:100%;min-height:0;display:none;overflow-y:auto}.VqXecW_root[data-detail=open] .VqXecW_catalog{display:none}.VqXecW_root[data-detail=open] .VqXecW_detail{display:flex}.VqXecW_mobileBack.VqXecW_nativeOutline{display:inline-flex}.VqXecW_detailHeader{grid-template-columns:76px minmax(0,1fr);align-items:start;gap:14px;display:grid}.VqXecW_skinAvatar{width:76px;height:76px}.VqXecW_titleBlock{padding-top:0}.VqXecW_titleBlock h2{font-size:20px;line-height:27px}.VqXecW_titleBlock .VqXecW_description{margin-top:7px}.VqXecW_titleBlock .VqXecW_version{flex-wrap:wrap;row-gap:2px;margin-top:6px}.VqXecW_actionRow{justify-content:flex-start}.VqXecW_aboutGrid{grid-template-columns:1fr}.VqXecW_aboutGrid>aside{border-top:1px solid var(--dsw-alias-border-l2);border-left:0}.VqXecW_recommendations>div{grid-template-columns:1fr}}@media (prefers-reduced-motion:reduce){.VqXecW_operation svg,.VqXecW_loading svg,.VqXecW_listLoading svg{animation:none}}";
		const tagId = "dsh-skin-market/SkinMarket.module.css";
		if (typeof document !== "undefined" && !document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]")) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-skin-market";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var SkinMarket_module_css_default = {
			"empty": "VqXecW_empty",
			"homeSectionTitle": "VqXecW_homeSectionTitle",
			"cardMetaLine": "VqXecW_cardMetaLine",
			"home": "VqXecW_home",
			"detailSkeleton": "VqXecW_detailSkeleton",
			"healthList": "VqXecW_healthList",
			"installOptions": "VqXecW_installOptions",
			"installedEmpty": "VqXecW_installedEmpty",
			"marketUpdateLabel": "VqXecW_marketUpdateLabel",
			"homeContent": "VqXecW_homeContent",
			"nativeOutline": "VqXecW_nativeOutline",
			"homeLoading": "VqXecW_homeLoading",
			"homeSection": "VqXecW_homeSection",
			"installedRow": "VqXecW_installedRow",
			"filterPill": "VqXecW_filterPill",
			"homeError": "VqXecW_homeError",
			"listSkeleton": "VqXecW_listSkeleton",
			"loading": "VqXecW_loading",
			"discoveryGrid": "VqXecW_discoveryGrid",
			"homeCardOpen": "VqXecW_homeCardOpen",
			"thumbnails": "VqXecW_thumbnails",
			"skinAvatar": "VqXecW_skinAvatar",
			"srOnly": "VqXecW_srOnly",
			"collectionTitle": "VqXecW_collectionTitle",
			"browser": "VqXecW_browser",
			"aboutGrid": "VqXecW_aboutGrid",
			"browserTitlebar": "VqXecW_browserTitlebar",
			"description": "VqXecW_description",
			"error": "VqXecW_error",
			"homeCardCopy": "VqXecW_homeCardCopy",
			"actionRow": "VqXecW_actionRow",
			"listLoading": "VqXecW_listLoading",
			"submission": "VqXecW_submission",
			"homeCardTitleRow": "VqXecW_homeCardTitleRow",
			"settingsNavIcon": "VqXecW_settingsNavIcon",
			"catalogHeader": "VqXecW_catalogHeader",
			"homeCard": "VqXecW_homeCard",
			"cardStars": "VqXecW_cardStars",
			"cardActionProgress": "VqXecW_cardActionProgress",
			"detail": "VqXecW_detail",
			"sortButton": "VqXecW_sortButton",
			"skinCardBody": "VqXecW_skinCardBody",
			"mobileBack": "VqXecW_mobileBack",
			"titleBlock": "VqXecW_titleBlock",
			"compactActionIcon": "VqXecW_compactActionIcon",
			"tags": "VqXecW_tags",
			"status": "VqXecW_status",
			"cardStatusActive": "VqXecW_cardStatusActive",
			"hero": "VqXecW_hero",
			"operation": "VqXecW_operation",
			"cardAction": "VqXecW_cardAction",
			"spin": "VqXecW_spin",
			"actionDivider": "VqXecW_actionDivider",
			"repoMeta": "VqXecW_repoMeta",
			"homeTitleRow": "VqXecW_homeTitleRow",
			"skeletonCard": "VqXecW_skeletonCard",
			"cardStatusUpdate": "VqXecW_cardStatusUpdate",
			"recommendations": "VqXecW_recommendations",
			"previewPlaceholder": "VqXecW_previewPlaceholder",
			"staticPill": "VqXecW_staticPill",
			"statusActive": "VqXecW_statusActive",
			"browserBackdrop": "VqXecW_browserBackdrop",
			"notice": "VqXecW_notice",
			"changelog": "VqXecW_changelog",
			"skeletonShimmer": "VqXecW_skeletonShimmer",
			"filterBar": "VqXecW_filterBar",
			"catalogTitle": "VqXecW_catalogTitle",
			"homeCardMedia": "VqXecW_homeCardMedia",
			"browserClose": "VqXecW_browserClose",
			"repoLink": "VqXecW_repoLink",
			"homeActions": "VqXecW_homeActions",
			"installedMoreCard": "VqXecW_installedMoreCard",
			"feedMeta": "VqXecW_feedMeta",
			"cardStatus": "VqXecW_cardStatus",
			"cardMeta": "VqXecW_cardMeta",
			"iconOnlyButton": "VqXecW_iconOnlyButton",
			"homeHeader": "VqXecW_homeHeader",
			"skinList": "VqXecW_skinList",
			"loadMoreHint": "VqXecW_loadMoreHint",
			"browserPanel": "VqXecW_browserPanel",
			"externalPlugin": "VqXecW_externalPlugin",
			"homeLoadMore": "VqXecW_homeLoadMore",
			"root": "VqXecW_root",
			"catalog": "VqXecW_catalog",
			"detailHeader": "VqXecW_detailHeader",
			"cardTitle": "VqXecW_cardTitle",
			"version": "VqXecW_version",
			"copyCapsuleButton": "VqXecW_copyCapsuleButton",
			"catalogTitleMain": "VqXecW_catalogTitleMain",
			"cardInlineActions": "VqXecW_cardInlineActions",
			"browserHomeBack": "VqXecW_browserHomeBack",
			"skinCard": "VqXecW_skinCard",
			"copyCapsule": "VqXecW_copyCapsule",
			"marketUpdateButton": "VqXecW_marketUpdateButton",
			"stars": "VqXecW_stars",
			"author": "VqXecW_author",
			"nativePrimary": "VqXecW_nativePrimary",
			"filters": "VqXecW_filters",
			"healthSuggestion": "VqXecW_healthSuggestion"
		};
		//#endregion
		//#region src/client/catalog-cache.ts
		const DATABASE = "dsh-skin-market";
		const STORE = "catalog";
		const KEY = "latest-v1";
		function openCatalogDatabase() {
			return new Promise((resolve, reject) => {
				if (typeof indexedDB === "undefined") return reject(/* @__PURE__ */ new Error("IndexedDB is unavailable"));
				const request = indexedDB.open(DATABASE, 1);
				request.onupgradeneeded = () => {
					if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
				};
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error ?? /* @__PURE__ */ new Error("Failed to open catalog cache"));
			});
		}
		function looksLikeCatalog(value) {
			return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && typeof item.id === "string");
		}
		const browserCatalogCache = {
			async read() {
				let database = null;
				try {
					database = await openCatalogDatabase();
					return await new Promise((resolve, reject) => {
						const request = database.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
						request.onsuccess = () => resolve(looksLikeCatalog(request.result) ? request.result : null);
						request.onerror = () => reject(request.error ?? /* @__PURE__ */ new Error("Failed to read catalog cache"));
					});
				} catch {
					return null;
				} finally {
					database?.close();
				}
			},
			async write(skins) {
				let database = null;
				try {
					database = await openCatalogDatabase();
					await new Promise((resolve, reject) => {
						const transaction = database.transaction(STORE, "readwrite");
						transaction.objectStore(STORE).put(skins, KEY);
						transaction.oncomplete = () => resolve();
						transaction.onerror = () => reject(transaction.error ?? /* @__PURE__ */ new Error("Failed to write catalog cache"));
						transaction.onabort = () => reject(transaction.error ?? /* @__PURE__ */ new Error("Catalog cache write aborted"));
					});
				} catch {} finally {
					database?.close();
				}
			}
		};
		//#endregion
		//#region src/client/submission.ts
		const REGISTRY_REPOSITORY = "https://github.com/kingOfSoySauce/dsh-skin-market";
		const REGISTRY_PATH = "registry/skins";
		function normalizeGitHubRepository(value) {
			try {
				const url = new URL(value.trim());
				if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
				const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
				if (parts.length !== 2) return null;
				return `https://github.com/${parts[0]}/${parts[1]}`;
			} catch {
				return null;
			}
		}
		function createSubmissionPrompt(repositoryInput) {
			const repository = repositoryInput === void 0 ? null : normalizeGitHubRepository(repositoryInput);
			if (repositoryInput !== void 0 && repository === null) return "";
			return `请把我的 DSH 皮肤提交到 DSH Skin Market。

${repository === null ? "皮肤仓库：如果当前工作区就是待提交的皮肤仓库，请确认它的公开 GitHub remote；否则先向我索要公开 GitHub 仓库地址。" : `皮肤仓库：${repository}`}
目标目录仓库：${REGISTRY_REPOSITORY}
目录路径：${REGISTRY_PATH}

请自主完成以下工作：
1. 只用只读方式检查皮肤仓库；识别单包或 monorepo 子包，读取 package.json、DSH bundle/client 声明、cordis.patch.yml、README、许可证、预览图和 release/tag。
2. 确认它确实是可安装的 DSH Web 皮肤。不要仅凭仓库名、README 文案或 dsh-plugin topic 判定。
3. 解析准备收录版本对应的完整 40 位 commit SHA。安装目标必须固定到该 SHA；禁止使用 main、master、HEAD 或其他可变分支。
4. 不要猜测皮肤名、包名、rowId、许可证、兼容版本或素材授权。缺少关键信息时先列出缺项，不要创建虚假条目。
5. 预览图只选仓库内真实截图，使用固定 commit 的 GitHub raw HTTPS 地址；不要使用 SVG、data URI、任意第三方图床或带追踪参数的 URL。
6. fork/clone 目标目录仓库，新建分支；按照 registry/skin.schema.json，在 ${REGISTRY_PATH} 下新增一个独立 YAML。不要修改无关文件，也不要覆盖已有条目。
7. 在目标目录仓库根目录运行 npm run registry 和相关测试。不得安装到我的真实 DSH profile，不得读取 .env、凭据、聊天记录或工作区外的私密文件。
8. 检查 git diff，提交变更并向 ${REGISTRY_REPOSITORY} 创建 PR。PR 标题使用“feat(registry): add <皮肤名>”，正文列出仓库、子包、版本、commit、许可证、预览来源、兼容性、自动检查结果和仍需人工确认的风险。
9. 创建 PR 后返回 PR 链接；如果没有 GitHub 权限或需要登录，只准备好分支、commit 和可复制的 PR 内容，明确告诉我下一步。

收录不等于安全认证。不要声称该皮肤已被 DSH 官方、安全团队或市场背书。`;
		}
		function createSkinInstallPrompt(skin) {
			const buildApproval = skin.install.allowBuild === void 0 ? "" : `\n- 这个固定版本包含 prepare 构建脚本。只允许精确构件键 \`${skin.install.allowBuild}\`：在 profile 的 pnpm-workspace.yaml 里合并 \`allowBuilds:\n    '${skin.install.allowBuild}': true\`，不得开启 dangerouslyAllowAllBuilds。`;
			return `请帮我把下面这个已固定版本的 DSH Web 皮肤安装到 web profile，并完成验证。\n\n- 仓库：${skin.repo}\n- 安装目标：${skin.install.target}\n- package：${skin.package}\n- loader rowId：${skin.rowId ?? skin.package}\n- 版本：${skin.install.version}\n- commit：${skin.install.commit}${buildApproval}\n\n要求：\n1. 不要改成 main、HEAD 或最新版本，必须使用上面的完整 commit。\n2. 运行 DSH 的 profile 插件安装命令；如果是只有 dsh.client 的皮肤，幂等地把上面的 package 和 rowId 注册到 web profile 的 cordis.patch.yml。\n3. 不要读取 .env、凭据或聊天记录；不要放宽其他包的构建权限。\n4. 安装后确认 profile package.json 中存在该依赖、node_modules 中的 package.json 声明了 dsh.client，并确认 loader 注册项存在。\n5. 告诉我是否需要重启 DSH Web；不要替我安装其他皮肤。`;
		}
		function createSkinInstallCommand(skin) {
			return `dsh plugin --profile web add '${skin.install.target}'`;
		}
		//#endregion
		//#region src/client/SkinMarketSection.tsx
		function captureListScroll(list) {
			if (list === null) return null;
			const listTop = list.getBoundingClientRect().top;
			const card = [...list.querySelectorAll("[data-skin-id]")].find((item) => item.getBoundingClientRect().bottom > listTop);
			return {
				skinId: card?.dataset.skinId ?? null,
				offset: card === void 0 ? 0 : card.getBoundingClientRect().top - listTop,
				scrollTop: list.scrollTop
			};
		}
		function restoreListScroll(list, anchor) {
			if (list === null || anchor === null) return;
			const card = anchor.skinId === null ? void 0 : [...list.querySelectorAll("[data-skin-id]")].find((item) => item.dataset.skinId === anchor.skinId);
			if (card === void 0) list.scrollTop = anchor.scrollTop;
			else list.scrollTop += card.getBoundingClientRect().top - list.getBoundingClientRect().top - anchor.offset;
		}
		const phases = {
			queued: "正在排队…",
			resolving: "正在解析版本…",
			downloading: "正在安装…",
			validating: "正在验证…",
			activating: "正在切换…",
			done: "完成",
			failed: "操作失败"
		};
		const mutationLabels = {
			install: "安装中",
			activate: "使用中",
			deactivate: "停用中",
			update: "更新中",
			uninstall: "卸载中"
		};
		const RELOAD_PARAM = "dsh-skin-reload";
		const ACTIVATION_WARNING_KEY = "dsh-skin-market:activation-warning-accepted";
		function restartReloadUrl(href, instanceId) {
			const url = new URL(href);
			url.searchParams.set(RELOAD_PARAM, instanceId);
			return url.toString();
		}
		function restoreMarketStyleOrder(root = document, marker = SkinMarket_module_css_default.filterPill) {
			for (const style of root.querySelectorAll("style")) if (style.dataset.plugin === "dsh-skin-market" || style.textContent?.includes(`.${marker}`) === true) style.parentNode?.appendChild(style);
		}
		async function json(url, init) {
			const response = await fetch(url, init);
			let body;
			try {
				body = await response.json();
			} catch {
				throw new Error(response.ok ? "皮肤市场服务未返回有效数据，请确认 Host 插件已经更新" : `皮肤市场请求失败（HTTP ${response.status}）`);
			}
			if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
			return body;
		}
		function runtimeFor(states, id) {
			return states.find((item) => item.skinId === id) ?? {
				skinId: id,
				installation: "missing",
				activation: "inactive",
				installedVersion: null,
				installedAt: null,
				updateAvailable: false
			};
		}
		function statusLabel(state) {
			if (state.installation === "broken") return "安装异常";
			if (state.activation === "active") return "正在使用";
			if (state.activation === "restart-required") return "需要重启";
			if (state.installation === "installed") return "已安装";
			return "未安装";
		}
		function displayDate(value) {
			const date = new Date(value);
			return Number.isNaN(date.getTime()) ? "未知" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
		}
		function PreviewMedia({ skin, src, alt, kind, loading }) {
			const [failed, setFailed] = (0, react.useState)(false);
			if (skin.review?.preview === "repository-card" || src === void 0 || failed) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SkinMarket_module_css_default.previewPlaceholder,
				"data-preview-kind": kind,
				role: "img",
				"aria-label": `${skin.name.zh} 暂无界面截图`,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarkGithubIcon, { "aria-hidden": "true" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: skin.author }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "暂无界面截图" })
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
				src,
				alt,
				loading,
				decoding: "async",
				onLoad: (event) => {
					event.currentTarget.dataset.loaded = "true";
				},
				onError: () => setFailed(true)
			});
		}
		const healthLabels = {
			readmeScreenshots: "README 截图",
			compatibility: "兼容版本",
			installation: "市场安装就绪",
			installCommand: "安装命令",
			topic: "dsh-plugin Topic"
		};
		function SkinMarketSection({ t, clientRuntime, catalogCache = browserCatalogCache }) {
			const [skins, setSkins] = (0, react.useState)([]);
			const [states, setStates] = (0, react.useState)([]);
			const [installedClientPlugins, setInstalledClientPlugins] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(true);
			const [catalogLoading, setCatalogLoading] = (0, react.useState)(true);
			const [selectedId, setSelectedId] = (0, react.useState)("");
			const [query, setQuery] = (0, react.useState)("");
			const [homeQuery, setHomeQuery] = (0, react.useState)("");
			const [filter, setFilter] = (0, react.useState)("all");
			const [sortBy, setSortBy] = (0, react.useState)("stars");
			const [visibleCount, setVisibleCount] = (0, react.useState)(20);
			const [homeVisibleCount, setHomeVisibleCount] = (0, react.useState)(20);
			const [installedSlots, setInstalledSlots] = (0, react.useState)(5);
			const [shotIndex, setShotIndex] = (0, react.useState)(0);
			const [busy, setBusy] = (0, react.useState)(null);
			const [mutation, setMutation] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [confirmUninstall, setConfirmUninstall] = (0, react.useState)(false);
			const [activationWarningAccepted, setActivationWarningAccepted] = (0, react.useState)(() => {
				try {
					return window.localStorage.getItem(ACTIVATION_WARNING_KEY) === "true";
				} catch {
					return false;
				}
			});
			const [confirmRestart, setConfirmRestart] = (0, react.useState)(false);
			const [restarting, setRestarting] = (0, react.useState)(false);
			const [runningAgents, setRunningAgents] = (0, react.useState)(null);
			const [restartCheckFinished, setRestartCheckFinished] = (0, react.useState)(false);
			const [showDetail, setShowDetail] = (0, react.useState)(false);
			const [browserOpen, setBrowserOpen] = (0, react.useState)(false);
			const [browserOrigin, setBrowserOrigin] = (0, react.useState)("discover");
			const [showSubmission, setShowSubmission] = (0, react.useState)(false);
			const [submissionCopied, setSubmissionCopied] = (0, react.useState)(false);
			const [showInstallOptions, setShowInstallOptions] = (0, react.useState)(false);
			const [installCopied, setInstallCopied] = (0, react.useState)(null);
			const [marketUpdate, setMarketUpdate] = (0, react.useState)(null);
			const [marketUpdating, setMarketUpdating] = (0, react.useState)(false);
			const [showMarketUpdated, setShowMarketUpdated] = (0, react.useState)(false);
			const [settingsNavIconHost, setSettingsNavIconHost] = (0, react.useState)(null);
			const skinListRef = (0, react.useRef)(null);
			const homeRef = (0, react.useRef)(null);
			const pendingScrollAnchor = (0, react.useRef)(null);
			const skinsRef = (0, react.useRef)([]);
			const selectedIdRef = (0, react.useRef)("");
			const userSelectedRef = (0, react.useRef)(false);
			const acceptCatalog = (0, react.useCallback)((incoming, runtimeStates = []) => {
				pendingScrollAnchor.current = captureListScroll(skinListRef.current);
				const nextSkins = [...incoming];
				const selectedBeforeRefresh = selectedIdRef.current;
				if (selectedBeforeRefresh !== "" && !nextSkins.some((skin) => skin.id === selectedBeforeRefresh)) {
					const selectedSkin = skinsRef.current.find((skin) => skin.id === selectedBeforeRefresh);
					if (selectedSkin !== void 0) nextSkins.push(selectedSkin);
				}
				skinsRef.current = nextSkins;
				setSkins(nextSkins);
				setSelectedId((value) => {
					const active = runtimeStates.find((item) => item.activation === "active");
					const activeId = active !== void 0 && nextSkins.some((skin) => skin.id === active.skinId) ? active.skinId : null;
					const next = !userSelectedRef.current && activeId !== null ? activeId : value !== "" && nextSkins.some((skin) => skin.id === value) ? value : nextSkins[0]?.id ?? "";
					selectedIdRef.current = next;
					return next;
				});
			}, []);
			const refresh = (0, react.useCallback)(async (showLoading = false) => {
				if (showLoading) {
					setLoading(true);
					if (skinsRef.current.length === 0) setCatalogLoading(true);
				}
				try {
					const catalogRequest = json("/dsh-skin-market/catalog").then((catalog) => {
						if (showLoading) setCatalogLoading(false);
						return catalog;
					});
					const stateRequest = json("/dsh-skin-market/state").then((state) => {
						if (showLoading) setLoading(false);
						return state;
					});
					const [catalog, state] = await Promise.all([catalogRequest, stateRequest]);
					acceptCatalog(catalog.skins, state.skins);
					catalogCache.write(catalog.skins).catch(() => void 0);
					setStates(state.skins);
					setInstalledClientPlugins(state.installedClientPlugins ?? []);
					setRunningAgents(typeof state.runningAgentCount === "number" && Number.isInteger(state.runningAgentCount) ? state.runningAgentCount : null);
				} finally {
					if (showLoading) {
						setLoading(false);
						setCatalogLoading(false);
					}
				}
			}, [acceptCatalog, catalogCache]);
			const checkMarketUpdate = (0, react.useCallback)(async () => {
				try {
					const status = await json("/dsh-skin-market/market-update");
					if (typeof status.updateAvailable === "boolean" && typeof status.currentVersion === "string" && typeof status.latestVersion === "string") setMarketUpdate(status);
				} catch {}
			}, []);
			const updateMarket = (0, react.useCallback)(async () => {
				setError(null);
				setMarketUpdating(true);
				try {
					const status = await json("/dsh-skin-market/market-update", { method: "POST" });
					setMarketUpdate(status);
					setShowMarketUpdated(true);
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setMarketUpdating(false);
				}
			}, []);
			const openRestartConfirm = (0, react.useCallback)(async () => {
				setError(null);
				setRunningAgents(null);
				setRestartCheckFinished(false);
				setConfirmRestart(true);
				try {
					const state = await json("/dsh-skin-market/state", { cache: "no-store" });
					setRunningAgents(typeof state.runningAgentCount === "number" && Number.isInteger(state.runningAgentCount) ? state.runningAgentCount : null);
					setRestartCheckFinished(true);
				} catch (reason) {
					setRestartCheckFinished(true);
					setError(reason instanceof Error ? reason.message : String(reason));
				}
			}, []);
			(0, react.useEffect)(() => {
				let disposed = false;
				(async () => {
					const cached = await catalogCache.read();
					if (disposed) return;
					if (cached !== null && cached.length > 0) {
						acceptCatalog(cached);
						setCatalogLoading(false);
					}
					await refresh(true).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
				})();
				return () => {
					disposed = true;
				};
			}, [
				acceptCatalog,
				catalogCache,
				refresh
			]);
			(0, react.useEffect)(() => {
				checkMarketUpdate();
			}, [checkMarketUpdate]);
			(0, react.useEffect)(() => {
				const timer = window.setInterval(() => {
					refresh(false).catch(() => void 0);
					checkMarketUpdate();
				}, 3e5);
				const refreshOnFocus = () => {
					refresh(false).catch(() => void 0);
					checkMarketUpdate();
				};
				window.addEventListener("focus", refreshOnFocus);
				return () => {
					window.clearInterval(timer);
					window.removeEventListener("focus", refreshOnFocus);
				};
			}, [checkMarketUpdate, refresh]);
			(0, react.useLayoutEffect)(() => {
				restoreListScroll(skinListRef.current, pendingScrollAnchor.current);
				pendingScrollAnchor.current = null;
			}, [skins]);
			(0, react.useEffect)(() => {
				const url = new URL(window.location.href);
				if (!url.searchParams.has(RELOAD_PARAM)) return;
				url.searchParams.delete(RELOAD_PARAM);
				window.history.replaceState(window.history.state, "", url);
			}, []);
			(0, react.useLayoutEffect)(() => {
				const home = homeRef.current;
				if (home === null || typeof ResizeObserver === "undefined") return;
				const updateSlots = () => {
					const width = home.clientWidth;
					setInstalledSlots(width < 560 ? 2 : width < 820 ? 3 : width < 1080 ? 4 : 5);
				};
				updateSlots();
				const observer = new ResizeObserver(updateSlots);
				observer.observe(home);
				return () => observer.disconnect();
			}, []);
			(0, react.useEffect)(() => {
				const style = document.createElement("style");
				style.dataset.dshSkinMarketWide = "true";
				style.textContent = "@media (min-width: 960px){[role=\"dialog\"]:has([data-dsh-skin-market]){width:min(1280px,calc(100vw - 48px));height:min(860px,calc(100vh - 48px))}}";
				document.head.appendChild(style);
				return () => style.remove();
			}, []);
			(0, react.useEffect)(() => {
				const currentNav = document.querySelector("[data-dsh-skin-market]")?.closest("[role=\"dialog\"]")?.querySelector("nav button[aria-current=\"true\"]");
				const defaultIcon = currentNav?.querySelector("svg");
				if (!(currentNav instanceof HTMLElement) || !(defaultIcon instanceof SVGElement)) return;
				const host = document.createElement("span");
				host.className = SkinMarket_module_css_default.settingsNavIcon;
				host.setAttribute("aria-hidden", "true");
				defaultIcon.dataset.dshSkinMarketDefaultIcon = "hidden";
				defaultIcon.insertAdjacentElement("beforebegin", host);
				setSettingsNavIconHost(host);
				return () => {
					defaultIcon.removeAttribute("data-dsh-skin-market-default-icon");
					host.remove();
				};
			}, []);
			const selected = skins.find((skin) => skin.id === selectedId) ?? skins[0];
			const state = selected === void 0 ? null : runtimeFor(states, selected.id);
			const compatibilityUnverified = selected?.review?.compatibility === "unverified";
			const manualOnly = selected?.review?.installation === "manual-only";
			const autoInstallable = !manualOnly;
			const filtered = (0, react.useMemo)(() => skins.filter((skin) => {
				if (!`${skin.name.zh} ${skin.name.en} ${skin.author} ${skin.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
				if (filter === "installed") return runtimeFor(states, skin.id).installation !== "missing";
				return true;
			}).sort((a, b) => sortBy === "latest" ? Date.parse(b.releaseUpdatedAt) - Date.parse(a.releaseUpdatedAt) : b.githubStars - a.githubStars), [
				skins,
				states,
				filter,
				query,
				sortBy
			]);
			const visibleSkins = (0, react.useMemo)(() => {
				const visible = filtered.slice(0, visibleCount);
				const selectedSkin = filtered.find((skin) => skin.id === selectedId);
				if (selectedSkin !== void 0 && !visible.some((skin) => skin.id === selectedSkin.id)) visible.push(selectedSkin);
				return visible;
			}, [
				filtered,
				selectedId,
				visibleCount
			]);
			const installedSkins = (0, react.useMemo)(() => skins.filter((skin) => runtimeFor(states, skin.id).installation !== "missing").sort((a, b) => {
				const aState = runtimeFor(states, a.id);
				const bState = runtimeFor(states, b.id);
				if (aState.activation === "active" && bState.activation !== "active") return -1;
				if (bState.activation === "active" && aState.activation !== "active") return 1;
				const recent = Date.parse(bState.installedAt ?? "") - Date.parse(aState.installedAt ?? "");
				return Number.isNaN(recent) || recent === 0 ? b.githubStars - a.githubStars : recent;
			}), [skins, states]);
			const discoverySkins = (0, react.useMemo)(() => skins.filter((skin) => {
				return `${skin.name.zh} ${skin.name.en} ${skin.author} ${skin.tags.join(" ")}`.toLowerCase().includes(homeQuery.trim().toLowerCase());
			}).sort((a, b) => sortBy === "latest" ? Date.parse(b.releaseUpdatedAt) - Date.parse(a.releaseUpdatedAt) : b.githubStars - a.githubStars), [
				homeQuery,
				skins,
				sortBy
			]);
			const visibleDiscoverySkins = (0, react.useMemo)(() => discoverySkins.slice(0, homeVisibleCount), [discoverySkins, homeVisibleCount]);
			const installedRowSkins = installedSkins.length > installedSlots ? installedSkins.slice(0, Math.max(1, installedSlots - 1)) : installedSkins;
			const installedOverflow = installedSkins.length > installedRowSkins.length;
			(0, react.useEffect)(() => {
				setVisibleCount(20);
			}, [
				filter,
				query,
				sortBy
			]);
			(0, react.useEffect)(() => {
				setHomeVisibleCount(20);
			}, [homeQuery, sortBy]);
			const runForSkin = (0, react.useCallback)(async (skinId, kind) => {
				const target = skins.find((skin) => skin.id === skinId);
				if (target === void 0) return false;
				setError(null);
				setMutation({
					skinId: target.id,
					kind
				});
				try {
					const result = await json(`/dsh-skin-market/${kind}`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ skinId: target.id })
					});
					for (;;) {
						const operation = await json(`/dsh-skin-market/operations/${result.operationId}`);
						setBusy(operation);
						if (operation.phase === "done") {
							setBusy(null);
							let needsRestart = false;
							if (kind === "deactivate" || kind === "uninstall") await clientRuntime?.setActive(target.package, false);
							else if (kind === "activate" && clientRuntime !== void 0) {
								needsRestart = !await switchClientSkin(clientRuntime, skins.map((skin) => skin.package), target.package);
								restoreMarketStyleOrder();
							}
							await refresh();
							if (needsRestart) {
								setStates((value) => value.map((item) => item.skinId === target.id ? {
									...item,
									activation: "restart-required"
								} : item));
								await openRestartConfirm();
							}
							return true;
						}
						if (operation.phase === "failed") throw new Error(operation.message ?? "操作失败");
						await new Promise((resolve) => setTimeout(resolve, 600));
					}
				} catch (reason) {
					setBusy(null);
					await refresh().catch(() => void 0);
					setError(reason instanceof Error ? reason.message : String(reason));
					return false;
				} finally {
					setMutation(null);
				}
			}, [
				clientRuntime,
				openRestartConfirm,
				refresh,
				skins
			]);
			const run = (0, react.useCallback)(async (kind) => selected === void 0 ? false : runForSkin(selected.id, kind), [runForSkin, selected]);
			const activateSelected = (0, react.useCallback)(() => {
				try {
					window.localStorage.setItem(ACTIVATION_WARNING_KEY, "true");
				} catch {}
				setActivationWarningAccepted(true);
				run("activate");
			}, [run]);
			const installAndActivate = (0, react.useCallback)(async () => {
				if (await run("install")) activateSelected();
			}, [activateSelected, run]);
			const restartNow = (0, react.useCallback)(async () => {
				if (selected === void 0) return;
				setRestarting(true);
				setError(null);
				try {
					const accepted = await json("/dsh-skin-market/restart", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ skinId: selected.id })
					});
					const deadline = Date.now() + 9e4;
					while (Date.now() < deadline) {
						await new Promise((resolve) => setTimeout(resolve, 500));
						try {
							const next = await json("/dsh-skin-market/state", { cache: "no-store" });
							if (next.instanceId !== accepted.instanceId) {
								window.location.replace(restartReloadUrl(window.location.href, next.instanceId));
								return;
							}
						} catch {}
					}
					throw new Error("DeepSeek Harness 重启超时，请手动刷新页面");
				} catch (reason) {
					setConfirmRestart(false);
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setRestarting(false);
				}
			}, [selected]);
			const chooseSkin = (id) => {
				userSelectedRef.current = true;
				selectedIdRef.current = id;
				setSelectedId(id);
				setShotIndex(0);
				setError(null);
				setInstallCopied(null);
				setShowInstallOptions(false);
			};
			const select = (id) => {
				chooseSkin(id);
				setShowDetail(true);
			};
			const openBrowser = (id, origin) => {
				chooseSkin(id);
				setBrowserOrigin(origin);
				setFilter(origin === "installed" ? "installed" : "all");
				setQuery("");
				setShowDetail(origin === "discover");
				setBrowserOpen(true);
			};
			const openInstalledBrowser = (id) => {
				const target = id ?? installedSkins.find((skin) => runtimeFor(states, skin.id).activation === "active")?.id ?? installedSkins[0]?.id;
				if (target !== void 0) openBrowser(target, "installed");
			};
			const closeBrowser = () => {
				setBrowserOpen(false);
				setShowDetail(false);
			};
			const openCardInstall = (skin) => {
				if (skin.review?.installation === "manual-only") {
					chooseSkin(skin.id);
					setInstallCopied(null);
					setShowInstallOptions(true);
					return;
				}
				runForSkin(skin.id, "install");
			};
			const activateCard = (skinId) => {
				try {
					window.localStorage.setItem(ACTIVATION_WARNING_KEY, "true");
				} catch {}
				setActivationWarningAccepted(true);
				runForSkin(skinId, "activate");
			};
			const recommendations = selected?.recommendations.map((id) => skins.find((skin) => skin.id === id)).filter((skin) => skin !== void 0) ?? [];
			const submissionPrompt = createSubmissionPrompt();
			const copySubmissionPrompt = async () => {
				await navigator.clipboard.writeText(submissionPrompt);
				setSubmissionCopied(true);
			};
			const copyInstallOption = async (method) => {
				if (selected === void 0) return;
				await navigator.clipboard.writeText(method === "prompt" ? createSkinInstallPrompt(selected) : createSkinInstallCommand(selected));
				setInstallCopied(`${selected.id}:${method}`);
			};
			const renderHomeCard = (skin, location, feedSize) => {
				const itemState = runtimeFor(states, skin.id);
				const cardMutation = mutation?.skinId === skin.id ? mutation : null;
				const needsInstall = itemState.installation === "missing" || itemState.installation === "broken";
				const actionCount = cardMutation !== null || needsInstall ? 1 : itemState.installation === "installed" ? Number(itemState.activation === "inactive" || itemState.activation === "active") + Number(itemState.updateAvailable) : 0;
				const stateText = itemState.installation === "broken" ? "安装异常" : itemState.activation === "active" ? "使用中" : itemState.activation === "restart-required" ? "待重启" : itemState.installation === "installed" ? "已安装" : null;
				const open = () => location === "installed" ? openInstalledBrowser(skin.id) : openBrowser(skin.id, "discover");
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
					className: SkinMarket_module_css_default.homeCard,
					"data-active": itemState.activation === "active" ? "true" : void 0,
					"data-feed-size": feedSize,
					"data-actions": actionCount,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "ghost",
						className: SkinMarket_module_css_default.homeCardOpen,
						"aria-current": itemState.activation === "active" ? "true" : void 0,
						"aria-label": location === "installed" ? `${skin.name.zh} 已安装卡片` : `${skin.name.zh} 界面预览`,
						onClick: open,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SkinMarket_module_css_default.homeCardMedia,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewMedia, {
								skin,
								src: skin.listScreenshot ?? skin.screenshots[0],
								alt: `${skin.name.zh} 界面预览`,
								kind: "recommendation",
								loading: "lazy"
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SkinMarket_module_css_default.homeCardCopy,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: SkinMarket_module_css_default.homeCardTitleRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									title: skin.name.zh,
									children: skin.name.zh
								}), stateText !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: itemState.activation === "active" ? `${SkinMarket_module_css_default.cardStatus} ${SkinMarket_module_css_default.cardStatusActive}` : itemState.installation === "broken" ? `${SkinMarket_module_css_default.cardStatus} ${SkinMarket_module_css_default.cardStatusUpdate}` : SkinMarket_module_css_default.cardStatus,
									children: stateText
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: skin.author }), location === "discover" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: SkinMarket_module_css_default.feedMeta,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StarIcon, {
										size: 12,
										"aria-hidden": "true"
									}),
									" ",
									skin.githubStars
								]
							})] })]
						})]
					}), actionCount > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SkinMarket_module_css_default.cardInlineActions,
						role: "group",
						"aria-label": `${skin.name.zh} 操作`,
						children: cardMutation !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SkinMarket_module_css_default.cardActionProgress,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {}), mutationLabels[cardMutation.kind]]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							needsInstall && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								className: SkinMarket_module_css_default.cardAction,
								variant: "ghost",
								size: "sm",
								disabled: mutation !== null,
								title: skin.review?.installation === "manual-only" ? "复制安装提示词" : "直接安装到当前 DSH",
								onClick: () => openCardInstall(skin),
								children: "安装"
							}),
							itemState.installation === "installed" && itemState.activation === "inactive" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								className: SkinMarket_module_css_default.cardAction,
								variant: "ghost",
								size: "sm",
								disabled: mutation !== null,
								onClick: () => activateCard(skin.id),
								children: "使用"
							}),
							itemState.installation === "installed" && itemState.activation === "active" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								className: SkinMarket_module_css_default.cardAction,
								variant: "ghost",
								size: "sm",
								disabled: mutation !== null,
								onClick: () => {
									runForSkin(skin.id, "deactivate");
								},
								children: "停用"
							}),
							itemState.installation === "installed" && itemState.updateAvailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								className: SkinMarket_module_css_default.cardAction,
								variant: "ghost",
								size: "sm",
								disabled: mutation !== null,
								onClick: () => {
									runForSkin(skin.id, "update");
								},
								children: "更新"
							})
						] })
					})]
				}, `${location}:${skin.id}`);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: SkinMarket_module_css_default.root,
				"data-dsh-skin-market": true,
				"data-detail": showDetail ? "open" : "closed",
				"data-browser-open": browserOpen ? "true" : "false",
				children: [
					settingsNavIconHost !== null && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(r, {
						size: 16,
						weight: "regular",
						"aria-hidden": "true"
					}), settingsNavIconHost),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
						className: SkinMarket_module_css_default.home,
						hidden: browserOpen,
						ref: homeRef,
						onScroll: (event) => {
							const home = event.currentTarget;
							if (discoverySkins.length > homeVisibleCount && home.scrollHeight - home.scrollTop - home.clientHeight < 560) setHomeVisibleCount((value) => Math.min(discoverySkins.length, value + 20));
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
							className: SkinMarket_module_css_default.homeHeader,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: SkinMarket_module_css_default.homeTitleRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [skins.length, " 款社区皮肤"] })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: SkinMarket_module_css_default.homeActions,
									children: [marketUpdate?.updateAvailable === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										className: `${SkinMarket_module_css_default.nativeOutline} ${SkinMarket_module_css_default.marketUpdateButton}`,
										variant: "outline",
										size: "sm",
										icon: marketUpdating ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16, {}),
										"aria-label": `更新皮肤市场到 ${marketUpdate.latestVersion}`,
										title: `发现新版本 ${marketUpdate.latestVersion}`,
										disabled: marketUpdating,
										"data-updating": marketUpdating ? "true" : void 0,
										onClick: () => {
											updateMarket();
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: SkinMarket_module_css_default.marketUpdateLabel,
											children: marketUpdating ? "更新中" : "更新"
										})
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										className: SkinMarket_module_css_default.nativeOutline,
										variant: "outline",
										size: "sm",
										onClick: () => {
											setShowSubmission(true);
											setSubmissionCopied(false);
										},
										children: "提交皮肤"
									})]
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								value: homeQuery,
								onChange: (event) => setHomeQuery(event.currentTarget.value),
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, {}),
								placeholder: t("search"),
								"aria-label": t("search")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SkinMarket_module_css_default.homeContent,
							children: [homeQuery.trim() === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: SkinMarket_module_css_default.homeSection,
								"aria-labelledby": "installed-skins-title",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: SkinMarket_module_css_default.homeSectionTitle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										id: "installed-skins-title",
										children: "已安装"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "当前使用优先，其余按最近安装排序" })]
								}), installedSkins.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: SkinMarket_module_css_default.installedRow,
									style: { "--installed-columns": installedSlots },
									children: [installedRowSkins.map((skin) => renderHomeCard(skin, "installed")), installedOverflow && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										className: `${SkinMarket_module_css_default.homeCard} ${SkinMarket_module_css_default.installedMoreCard}`,
										onClick: () => openInstalledBrowser(),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(r$1, {
											size: 24,
											"aria-hidden": "true"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "查看全部已安装" })]
									})]
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: SkinMarket_module_css_default.installedEmpty,
									children: "尚未安装皮肤，从下面挑一个喜欢的开始。"
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: SkinMarket_module_css_default.homeSection,
								"aria-labelledby": "discover-skins-title",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: SkinMarket_module_css_default.homeSectionTitle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											id: "discover-skins-title",
											children: homeQuery.trim() === "" ? "发现更多" : "搜索结果"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											className: SkinMarket_module_css_default.sortButton,
											variant: "ghost",
											size: "sm",
											onClick: () => setSortBy((value) => value === "stars" ? "latest" : "stars"),
											children: [
												sortBy === "stars" ? "Stars" : "最新",
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})
											]
										})]
									}),
									catalogLoading && skins.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: SkinMarket_module_css_default.homeLoading,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {}), " 正在加载皮肤…"]
									}) : visibleDiscoverySkins.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: SkinMarket_module_css_default.discoveryGrid,
										children: visibleDiscoverySkins.map((skin, index) => renderHomeCard(skin, "discover", index % 3))
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: SkinMarket_module_css_default.empty,
										children: "没有匹配的皮肤"
									}),
									error !== null && !browserOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: SkinMarket_module_css_default.homeError,
										role: "alert",
										children: error
									}),
									!catalogLoading && homeVisibleCount < discoverySkins.length && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: SkinMarket_module_css_default.homeLoadMore,
										"aria-hidden": "true",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})]
									})
								]
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: SkinMarket_module_css_default.browser,
						hidden: !browserOpen,
						role: "dialog",
						"aria-modal": "true",
						"aria-label": "皮肤详情",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: SkinMarket_module_css_default.browserBackdrop,
							"aria-hidden": "true",
							tabIndex: -1,
							onClick: closeBrowser
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SkinMarket_module_css_default.browserPanel,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
									className: SkinMarket_module_css_default.browserTitlebar,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: browserOrigin === "installed" ? "已安装皮肤" : "皮肤详情" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: selected?.name.zh })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										className: `${SkinMarket_module_css_default.browserClose} ${SkinMarket_module_css_default.nativeOutline}`,
										variant: "outline",
										size: "sm",
										icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(e, { size: 15 }),
										"aria-label": "关闭皮肤详情",
										title: "关闭当前详情，返回皮肤市场",
										onClick: closeBrowser,
										children: "关闭详情"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
									className: SkinMarket_module_css_default.catalog,
									"aria-label": t("catalog"),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: SkinMarket_module_css_default.catalogHeader,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												className: `${SkinMarket_module_css_default.browserHomeBack} ${SkinMarket_module_css_default.nativeOutline}`,
												variant: "outline",
												size: "sm",
												icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, {}),
												onClick: closeBrowser,
												children: "返回发现"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: SkinMarket_module_css_default.catalogTitle,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: SkinMarket_module_css_default.catalogTitleMain,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }), marketUpdate?.updateAvailable === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														className: `${SkinMarket_module_css_default.nativeOutline} ${SkinMarket_module_css_default.marketUpdateButton}`,
														variant: "outline",
														size: "sm",
														icon: marketUpdating ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16, {}),
														"aria-label": `更新皮肤市场到 ${marketUpdate.latestVersion}`,
														title: `发现新版本 ${marketUpdate.latestVersion}`,
														disabled: marketUpdating,
														"data-updating": marketUpdating ? "true" : void 0,
														onClick: () => {
															updateMarket();
														},
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: SkinMarket_module_css_default.marketUpdateLabel,
															children: marketUpdating ? "更新中" : "更新"
														})
													})]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													className: SkinMarket_module_css_default.nativeOutline,
													variant: "outline",
													size: "sm",
													onClick: () => {
														setShowSubmission(true);
														setSubmissionCopied(false);
													},
													children: "提交皮肤"
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												value: query,
												onChange: (event) => setQuery(event.currentTarget.value),
												icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, {}),
												placeholder: t("search"),
												"aria-label": t("search")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: SkinMarket_module_css_default.filterBar,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: SkinMarket_module_css_default.filters,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
														className: SkinMarket_module_css_default.filterPill,
														"data-active": filter === "all" ? "true" : void 0,
														"aria-pressed": filter === "all",
														onClick: () => setFilter("all"),
														children: "全部"
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
														className: SkinMarket_module_css_default.filterPill,
														"data-active": filter === "installed" ? "true" : void 0,
														"aria-pressed": filter === "installed",
														onClick: () => setFilter("installed"),
														children: "已安装"
													})]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													className: SkinMarket_module_css_default.sortButton,
													variant: "ghost",
													size: "sm",
													onClick: () => setSortBy((value) => value === "stars" ? "latest" : "stars"),
													children: [
														sortBy === "stars" ? "Stars" : "最新",
														" ",
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})
													]
												})]
											})
										]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: SkinMarket_module_css_default.skinList,
										ref: skinListRef,
										onScroll: (event) => {
											const list = event.currentTarget;
											if (filtered.length > visibleCount && list.scrollHeight - list.scrollTop - list.clientHeight < 320) setVisibleCount((value) => Math.min(filtered.length, value + 20));
										},
										children: [
											catalogLoading && skins.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: SkinMarket_module_css_default.listSkeleton,
												role: "status",
												"aria-label": "正在加载皮肤列表",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: SkinMarket_module_css_default.srOnly,
													children: "正在加载皮肤列表…"
												}), Array.from({ length: 8 }, (_, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: SkinMarket_module_css_default.skeletonCard,
													"aria-hidden": "true",
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {})] }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {})
													]
												}, index))]
											}) : visibleSkins.map((skin) => {
												const itemState = runtimeFor(states, skin.id);
												const mutationLabel = mutation?.skinId === skin.id ? mutationLabels[mutation.kind] : null;
												return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													variant: "ghost",
													className: SkinMarket_module_css_default.skinCard,
													"data-skin-id": skin.id,
													"data-selected": skin.id === selected?.id,
													"aria-current": skin.id === selected?.id ? "true" : void 0,
													onClick: () => select(skin.id),
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewMedia, {
															skin,
															src: skin.listScreenshot ?? skin.screenshots[0],
															alt: `${skin.name.zh} 界面预览`,
															kind: "list",
															loading: "lazy"
														}, `${skin.id}:${skin.listScreenshot ?? skin.screenshots[0] ?? "missing"}:list`),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
															className: SkinMarket_module_css_default.skinCardBody,
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: SkinMarket_module_css_default.cardTitle,
																children: skin.name.zh
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																className: SkinMarket_module_css_default.cardMetaLine,
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: SkinMarket_module_css_default.cardMeta,
																	children: skin.author
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																	className: SkinMarket_module_css_default.cardStars,
																	title: `GitHub Stars 快照，更新于 ${displayDate(skin.starsUpdatedAt)}`,
																	children: [
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StarIcon, {
																			size: 12,
																			"aria-hidden": "true"
																		}),
																		" ",
																		skin.githubStars
																	]
																})]
															})]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: mutationLabel !== null ? `${SkinMarket_module_css_default.cardStatus} ${SkinMarket_module_css_default.cardStatusUpdate}` : itemState.activation === "active" ? `${SkinMarket_module_css_default.cardStatus} ${SkinMarket_module_css_default.cardStatusActive}` : itemState.updateAvailable ? `${SkinMarket_module_css_default.cardStatus} ${SkinMarket_module_css_default.cardStatusUpdate}` : SkinMarket_module_css_default.cardStatus,
															children: mutationLabel ?? (itemState.activation === "active" ? "使用中" : itemState.updateAvailable ? "可更新" : itemState.installation === "missing" && skin.review?.installation === "manual-only" ? "手动安装" : statusLabel(itemState))
														})
													]
												}, skin.id);
											}),
											!catalogLoading && visibleCount < filtered.length && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: SkinMarket_module_css_default.loadMoreHint,
												"aria-hidden": "true",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})]
											}),
											!catalogLoading && filtered.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: SkinMarket_module_css_default.empty,
												children: "没有匹配的皮肤"
											}),
											!loading && filter === "installed" && installedClientPlugins.map((plugin) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: `${SkinMarket_module_css_default.skinCard} ${SkinMarket_module_css_default.externalPlugin}`,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: SkinMarket_module_css_default.skinCardBody,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: SkinMarket_module_css_default.cardTitle,
														children: plugin.package
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: SkinMarket_module_css_default.cardMetaLine,
														children: [
															"市场外客户端插件 · ",
															plugin.version ?? "版本未知",
															" · ",
															plugin.registered ? `已注册 ${plugin.rowIds.join(", ")}` : "尚未发现 loader 注册项"
														]
													})]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
													className: SkinMarket_module_css_default.cardStatus,
													children: "市场外"
												})]
											}, plugin.package)),
											!loading && browserOpen && selected === void 0 && error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: SkinMarket_module_css_default.error,
												role: "alert",
												children: error
											})
										]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("main", {
									className: SkinMarket_module_css_default.detail,
									children: loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: SkinMarket_module_css_default.detailSkeleton,
										role: "status",
										"aria-label": "正在加载皮肤详情",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: SkinMarket_module_css_default.srOnly,
												children: "正在加载皮肤详情…"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {})] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
										]
									}) : selected !== void 0 && state !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											className: `${SkinMarket_module_css_default.mobileBack} ${SkinMarket_module_css_default.nativeOutline}`,
											variant: "outline",
											size: "sm",
											icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, {}),
											onClick: () => browserOrigin === "discover" ? closeBrowser() : setShowDetail(false),
											children: browserOrigin === "discover" ? "返回发现" : "返回列表"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
											className: SkinMarket_module_css_default.detailHeader,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: SkinMarket_module_css_default.skinAvatar,
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewMedia, {
													skin: selected,
													src: selected.listScreenshot ?? selected.screenshots[0],
													alt: "",
													kind: "avatar"
												}, `${selected.id}:${selected.listScreenshot ?? selected.screenshots[0] ?? "missing"}:avatar`)
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: SkinMarket_module_css_default.titleBlock,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: selected.name.zh }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														className: SkinMarket_module_css_default.author,
														children: selected.author
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														className: SkinMarket_module_css_default.description,
														children: selected.description
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
														className: SkinMarket_module_css_default.version,
														children: [
															"版本 ",
															selected.install.version,
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																"aria-hidden": "true",
																children: " · "
															}),
															compatibilityUnverified ? "DSH 兼容性待验证" : `兼容 DSH ${selected.compatibility.dsh}`,
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
																className: state.activation === "active" ? `${SkinMarket_module_css_default.status} ${SkinMarket_module_css_default.statusActive}` : SkinMarket_module_css_default.status,
																children: statusLabel(state)
															})
														]
													})
												]
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: SkinMarket_module_css_default.actionRow,
											children: [
												state.installation === "missing" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
													autoInstallable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														className: SkinMarket_module_css_default.nativePrimary,
														variant: "primary",
														size: "sm",
														icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16, {}),
														disabled: busy !== null,
														onClick: () => void installAndActivate(),
														children: "安装并使用"
													}),
													autoInstallable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														className: SkinMarket_module_css_default.nativeOutline,
														variant: "outline",
														size: "sm",
														disabled: busy !== null,
														onClick: () => void run("install"),
														children: "仅安装"
													}),
													autoInstallable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														className: SkinMarket_module_css_default.nativeOutline,
														variant: "outline",
														size: "sm",
														disabled: busy !== null,
														onClick: () => {
															setInstallCopied(null);
															setShowInstallOptions(true);
														},
														children: "其他安装方式"
													}),
													manualOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														className: SkinMarket_module_css_default.nativeOutline,
														variant: "outline",
														size: "sm",
														icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarkGithubIcon, { size: 16 }),
														disabled: busy !== null,
														title: "前往 GitHub 查看维护者提供的手动安装方式",
														onClick: () => window.open(selected.repo, "_blank", "noopener,noreferrer"),
														children: "查看安装说明"
													})
												] }),
												state.installation === "installed" && state.activation === "inactive" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													className: SkinMarket_module_css_default.nativePrimary,
													variant: "primary",
													size: "sm",
													disabled: busy !== null,
													onClick: activateSelected,
													children: "使用"
												}),
												state.activation === "restart-required" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													className: SkinMarket_module_css_default.nativePrimary,
													variant: "primary",
													size: "sm",
													disabled: busy !== null,
													onClick: () => void openRestartConfirm(),
													children: "重启以应用"
												}),
												state.activation === "active" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													className: SkinMarket_module_css_default.nativeOutline,
													variant: "outline",
													size: "sm",
													disabled: busy !== null,
													onClick: () => void run("deactivate"),
													children: "停用"
												}),
												state.updateAvailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													className: `${state.activation === "active" ? SkinMarket_module_css_default.nativePrimary : SkinMarket_module_css_default.nativeOutline} ${SkinMarket_module_css_default.compactActionIcon}`,
													variant: state.activation === "active" ? "primary" : "outline",
													size: "sm",
													icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, {}),
													disabled: busy !== null,
													onClick: () => void run("update"),
													children: "更新"
												}),
												state.installation !== "missing" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													className: `${SkinMarket_module_css_default.nativeOutline} ${SkinMarket_module_css_default.iconOnlyButton} ${SkinMarket_module_css_default.compactActionIcon}`,
													variant: "outline",
													size: "sm",
													icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),
													"aria-label": "卸载",
													title: "卸载",
													disabled: busy !== null,
													onClick: () => setConfirmUninstall(true)
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: SkinMarket_module_css_default.actionDivider,
													"aria-hidden": "true"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: SkinMarket_module_css_default.repoMeta,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: SkinMarket_module_css_default.stars,
														title: `GitHub Stars 快照，更新于 ${displayDate(selected.starsUpdatedAt)}`,
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StarIcon, {
																size: 16,
																"aria-hidden": "true"
															}),
															" ",
															selected.githubStars
														]
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
														className: SkinMarket_module_css_default.repoLink,
														href: selected.repo,
														target: "_blank",
														rel: "noreferrer",
														title: selected.repo,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarkGithubIcon, {
															size: 16,
															"aria-hidden": "true"
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: selected.repo.replace("https://", "") })]
													})]
												})
											]
										}),
										state.installation === "installed" && state.activation === "inactive" && !activationWarningAccepted && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: SkinMarket_module_css_default.notice,
											role: "note",
											children: "首次启用提示：请先在设置 → 插件中停用其他皮肤、主题和外观插件，避免全局样式冲突。点击“使用”即表示已确认。"
										}),
										busy !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: SkinMarket_module_css_default.operation,
											role: "status",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, { size: 16 }),
												" ",
												phases[busy.phase]
											]
										}),
										error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: SkinMarket_module_css_default.error,
											role: "alert",
											children: error
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: SkinMarket_module_css_default.hero,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewMedia, {
												skin: selected,
												src: selected.screenshots[shotIndex] ?? selected.screenshots[0],
												alt: `${selected.name.zh} 大图预览`,
												kind: "hero"
											}, `${selected.id}:${selected.screenshots[shotIndex] ?? selected.screenshots[0] ?? "missing"}:hero`)
										}),
										selected.screenshots.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: SkinMarket_module_css_default.thumbnails,
											"aria-label": "截图选择",
											children: selected.screenshots.map((shot, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "ghost",
												"data-selected": index === shotIndex,
												onClick: () => setShotIndex(index),
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewMedia, {
													skin: selected,
													src: shot,
													alt: `${selected.name.zh} 截图 ${index + 1}`,
													kind: "thumbnail",
													loading: "lazy"
												})
											}, shot))
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: SkinMarket_module_css_default.aboutGrid,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "关于此皮肤" }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: selected.description }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: SkinMarket_module_css_default.tags,
													children: selected.tags.map((tag) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
														className: SkinMarket_module_css_default.staticPill,
														children: tag
													}, tag))
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
													className: SkinMarket_module_css_default.metadata,
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "许可证" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: selected.license.code })] }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "代码商业使用" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: selected.license.commercialUse ? "许可证允许" : "未获授权" })] }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "模式" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: selected.modes.join(" / ") })] })
													]
												}),
												compatibilityUnverified && !manualOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													className: SkinMarket_module_css_default.notice,
													children: "市场已具备自动安装所需信息，但维护者尚未声明 DSH 兼容范围。仍可安装；建议先确认当前 DSH Web 版本，并留意安装后的界面表现。"
												}),
												manualOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													className: SkinMarket_module_css_default.notice,
													children: "该仓库距离市场的一键安装规范还差少量信息；可参考右侧仓库健康建议完善，当前请按维护者说明安装。"
												}),
												selected.review?.preview === "repository-card" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													className: SkinMarket_module_css_default.notice,
													children: "该仓库暂无可识别的皮肤截图，市场使用本地占位卡，不会加载 GitHub 仓库图片。"
												}),
												selected.marketScreenshots?.length && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
													className: SkinMarket_module_css_default.notice,
													children: [
														"前 ",
														selected.marketScreenshots.length,
														" 张截图由市场在隔离 DSH 中实机补录；仓库截图按原顺序排在后面。维护者可向目录仓库提交 PR 删除或替换补录图。"
													]
												}),
												selected.license.notice && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													className: SkinMarket_module_css_default.notice,
													children: selected.license.notice
												})
											] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
												className: SkinMarket_module_css_default.changelog,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "仓库健康" }),
													selected.health ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", {
														className: SkinMarket_module_css_default.healthList,
														children: Object.entries(selected.health.checks).map(([key, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: healthLabels[key] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															"data-health": value,
															children: value === "pass" ? "符合要求" : "建议完善"
														})] }, key))
													}), selected.health.suggestions.map((suggestion) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														className: SkinMarket_module_css_default.healthSuggestion,
														children: suggestion
													}, suggestion))] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														className: SkinMarket_module_css_default.healthSuggestion,
														children: "等待下一次仓库健康扫描。"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
														className: SkinMarket_module_css_default.collectionTitle,
														children: "收录信息"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ol", { children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: selected.install.version }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["版本快照更新于 ", displayDate(selected.releaseUpdatedAt)] })] }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "Stars" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
															selected.githubStars,
															"，更新于 ",
															displayDate(selected.starsUpdatedAt)
														] })] }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "兼容" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: compatibilityUnverified ? "等待维护者声明 DSH 兼容范围" : `支持 DSH ${selected.compatibility.dsh}` })] })
													] }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
														href: selected.repo,
														target: "_blank",
														rel: "noreferrer",
														children: "查看仓库详情"
													})
												]
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
											className: SkinMarket_module_css_default.recommendations,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "更多推荐" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: recommendations.map((skin) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "ghost",
												onClick: () => select(skin.id),
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewMedia, {
													skin,
													src: skin.listScreenshot ?? skin.screenshots[0],
													alt: "",
													kind: "recommendation",
													loading: "lazy"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: skin.name.zh }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StarIcon, {
														size: 12,
														"aria-hidden": "true"
													}),
													" ",
													skin.githubStars
												] })] })]
											}, skin.id)) })]
										})
									] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: SkinMarket_module_css_default.loading,
										children: "暂无可展示的皮肤详情"
									})
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: confirmUninstall,
						onClose: () => setConfirmUninstall(false),
						title: "卸载皮肤",
						closeLabel: "关闭",
						description: state?.activation === "active" ? "当前皮肤会先停用并恢复 DSH 默认外观，然后删除安装包。" : "将从当前 DSH profile 删除这个皮肤安装包。",
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: SkinMarket_module_css_default.nativeOutline,
							variant: "outline",
							size: "sm",
							onClick: () => setConfirmUninstall(false),
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: SkinMarket_module_css_default.nativePrimary,
							variant: "primary",
							size: "sm",
							onClick: () => {
								setConfirmUninstall(false);
								run("uninstall");
							},
							children: "确认卸载"
						})] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: showInstallOptions,
						onClose: () => setShowInstallOptions(false),
						title: `安装 ${selected?.name.zh ?? "皮肤"}`,
						closeLabel: "关闭",
						description: manualOnly ? "该皮肤暂不支持市场直接安装，请复制提示词交给 Agent 处理。" : "任选一种，不用都执行。",
						footer: manualOnly ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: SkinMarket_module_css_default.nativeOutline,
							variant: "outline",
							size: "sm",
							onClick: () => setShowInstallOptions(false),
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: SkinMarket_module_css_default.nativePrimary,
							variant: "primary",
							size: "sm",
							onClick: () => void copyInstallOption("prompt"),
							children: installCopied === `${selected?.id}:prompt` ? "提示词已复制" : "复制提示词"
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: SkinMarket_module_css_default.nativeOutline,
							variant: "outline",
							size: "sm",
							onClick: () => setShowInstallOptions(false),
							children: "关闭"
						}),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SkinMarket_module_css_default.installOptions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "提示词" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: SkinMarket_module_css_default.copyCapsule,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
									title: selected === void 0 ? "" : createSkinInstallPrompt(selected),
									children: selected === void 0 ? "" : createSkinInstallPrompt(selected)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									className: `${SkinMarket_module_css_default.nativeOutline} ${SkinMarket_module_css_default.copyCapsuleButton}`,
									variant: "outline",
									size: "sm",
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {}),
									"aria-label": installCopied === `${selected?.id}:prompt` ? "提示词已复制" : "复制提示词",
									title: "复制提示词",
									onClick: () => void copyInstallOption("prompt")
								})]
							})] }), !manualOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "命令" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: SkinMarket_module_css_default.copyCapsule,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
									title: selected === void 0 ? "" : createSkinInstallCommand(selected),
									children: selected === void 0 ? "" : createSkinInstallCommand(selected)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									className: `${SkinMarket_module_css_default.nativeOutline} ${SkinMarket_module_css_default.copyCapsuleButton}`,
									variant: "outline",
									size: "sm",
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {}),
									"aria-label": installCopied === `${selected?.id}:command` ? "命令已复制" : "复制命令",
									title: "复制命令",
									onClick: () => void copyInstallOption("command")
								})]
							})] })]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: confirmRestart,
						onClose: () => {
							if (!restarting) setConfirmRestart(false);
						},
						title: "需要重启 DSH 应用此皮肤",
						closeLabel: "关闭",
						description: restarting ? "正在重新启动 DSH，请稍候…" : runningAgents === null && !restartCheckFinished ? "正在检查是否有 Agent 运行。状态确认前不能重启。" : runningAgents === null ? "当前 Host 尚未加载安全检查。请确认没有 Agent 正在运行、重要内容已保存；你可以继续完成这一次升级重启。新版本加载后会自动检测 Agent 状态。" : runningAgents > 0 ? `检测到 ${runningAgents} 个 Agent 正在运行，现在不能重启。请等待任务完全结束后再试，否则可能中断任务并导致会话历史无法加载。` : "Agent 状态检查已通过。但重启仍会关闭所有会话连接；即使回复已经停止显示，也请确认重要内容已保存，且没有即将开始的新任务。",
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: SkinMarket_module_css_default.nativeOutline,
							variant: "outline",
							size: "sm",
							disabled: restarting,
							onClick: () => setConfirmRestart(false),
							children: "稍后"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: SkinMarket_module_css_default.nativePrimary,
							variant: "primary",
							size: "sm",
							disabled: restarting || runningAgents === null && !restartCheckFinished || (runningAgents ?? 0) > 0,
							onClick: () => void restartNow(),
							children: restarting ? "正在重启…" : runningAgents === null && !restartCheckFinished ? "正在检查…" : runningAgents === null ? "我已确认无任务，仍然重启" : runningAgents > 0 ? "有任务运行中" : "确认无任务，立即重启"
						})] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: showMarketUpdated,
						onClose: () => setShowMarketUpdated(false),
						title: "皮肤市场已更新",
						closeLabel: "关闭",
						description: `新版本 ${marketUpdate?.latestVersion ?? ""} 已安装。重启 DSH Web 后生效，当前选择和已安装皮肤不会改变。`,
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: SkinMarket_module_css_default.nativePrimary,
							variant: "primary",
							size: "sm",
							onClick: () => setShowMarketUpdated(false),
							children: "知道了"
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: showSubmission,
						onClose: () => setShowSubmission(false),
						title: "提交你的皮肤",
						closeLabel: "关闭",
						description: "复制下面的提示词交给你的 Agent，它会确认皮肤仓库、完成检查并准备市场 PR。",
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: SkinMarket_module_css_default.nativeOutline,
							variant: "outline",
							size: "sm",
							onClick: () => setShowSubmission(false),
							children: "关闭"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: SkinMarket_module_css_default.nativePrimary,
							variant: "primary",
							size: "sm",
							onClick: () => void copySubmissionPrompt(),
							children: submissionCopied ? "已复制" : "复制提示词"
						})] }),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SkinMarket_module_css_default.submission,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								"aria-label": "Agent 投稿提示词",
								readOnly: true,
								value: submissionPrompt,
								rows: 16
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "提示词不会授权 Agent 安装皮肤到你的 DSH，也不会把 Topic 收录等同于安全审核。" })]
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		const namespace = "dsh-skin-market";
		const dictionaries = {
			zh: {
				nav: "皮肤市场",
				title: "皮肤市场",
				subtitle: "发现并管理 DSH 外观",
				search: "搜索皮肤",
				catalog: "皮肤列表"
			},
			en: {
				nav: "Skin Market",
				title: "Skin Market",
				subtitle: "Discover and manage DSH skins",
				search: "Search skins",
				catalog: "Skin catalog"
			}
		};
		async function switchClientSkin(runtime, packageNames, target) {
			for (const packageName of packageNames) await runtime.setActive(packageName, false);
			return runtime.setActive(target, true);
		}
		function createClientSkinRuntime(loader) {
			return { async setActive(packageName, active) {
				const entry = [...loader.entries()].find((item) => item.options.name === packageName);
				if (entry === void 0) return false;
				await entry.update({ disabled: active ? null : true }, false, true);
				return true;
			} };
		}
		const name = "dsh-skin-market";
		const inject = [
			"slots",
			"locale",
			"loader"
		];
		const REQUIRED_PRIMITIVES = [
			"Button",
			"Input",
			"Modal",
			"Pill"
		];
		function missingPrimitives(module) {
			return REQUIRED_PRIMITIVES.filter((key) => module[key] === void 0);
		}
		function apply(ctx) {
			const missing = missingPrimitives(_deepseek_ai_dsh_client_ui_primitives);
			if (missing.length > 0) {
				console.warn(`[dsh-skin-market] missing DSH primitives: ${missing.join(", ")}`);
				return;
			}
			ctx.effect(() => ctx.locale.register(namespace, dictionaries), "dsh-skin-market: locale");
			const t = ctx.locale.bind(namespace);
			const clientRuntime = createClientSkinRuntime(ctx.loader);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "skin-market",
				order: 45,
				label: () => t("nav"),
				locale: namespace,
				inject: () => ({ t })
			}, () => (0, react.createElement)(SkinMarketSection, {
				t,
				clientRuntime
			})));
		}
		//#endregion
		exports.REQUIRED_PRIMITIVES = REQUIRED_PRIMITIVES;
		exports.SkinMarketSection = SkinMarketSection;
		exports.apply = apply;
		exports.createClientSkinRuntime = createClientSkinRuntime;
		exports.inject = inject;
		exports.missingPrimitives = missingPrimitives;
		exports.name = name;
		exports.switchClientSkin = switchClientSkin;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map