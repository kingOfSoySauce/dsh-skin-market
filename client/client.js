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
		const e$3 = /* @__PURE__ */ new Map([
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
		//#region node_modules/@phosphor-icons/react/dist/defs/UploadSimple.es.js
		const e$2 = /* @__PURE__ */ new Map([
			["bold", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M228,144v64a12,12,0,0,1-12,12H40a12,12,0,0,1-12-12V144a12,12,0,0,1,24,0v52H204V144a12,12,0,0,1,24,0ZM96.49,80.49,116,61v83a12,12,0,0,0,24,0V61l19.51,19.52a12,12,0,1,0,17-17l-40-40a12,12,0,0,0-17,0l-40,40a12,12,0,1,0,17,17Z" }))],
			["duotone", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", {
				d: "M216,48V208H40V48A16,16,0,0,1,56,32H200A16,16,0,0,1,216,48Z",
				opacity: "0.2"
			}), /* @__PURE__ */ react.createElement("path", { d: "M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0ZM93.66,77.66,120,51.31V144a8,8,0,0,0,16,0V51.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,77.66Z" }))],
			["fill", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0ZM88,80h32v64a8,8,0,0,0,16,0V80h32a8,8,0,0,0,5.66-13.66l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,88,80Z" }))],
			["light", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M222,144v64a6,6,0,0,1-6,6H40a6,6,0,0,1-6-6V144a6,6,0,0,1,12,0v58H210V144a6,6,0,0,1,12,0ZM92.24,76.24,122,46.49V144a6,6,0,0,0,12,0V46.49l29.76,29.75a6,6,0,0,0,8.48-8.48l-40-40a6,6,0,0,0-8.48,0l-40,40a6,6,0,0,0,8.48,8.48Z" }))],
			["regular", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0ZM93.66,77.66,120,51.31V144a8,8,0,0,0,16,0V51.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,77.66Z" }))],
			["thin", /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement("path", { d: "M220,144v64a4,4,0,0,1-4,4H40a4,4,0,0,1-4-4V144a4,4,0,0,1,8,0v60H212V144a4,4,0,0,1,8,0ZM90.83,74.83,124,41.66V144a4,4,0,0,0,8,0V41.66l33.17,33.17a4,4,0,1,0,5.66-5.66l-40-40a4,4,0,0,0-5.66,0l-40,40a4,4,0,0,0,5.66,5.66Z" }))]
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
		const r = react.forwardRef((e, a) => /* @__PURE__ */ react.createElement(p, {
			ref: a,
			...e,
			weights: e$3
		}));
		r.displayName = "SquaresFourIcon";
		//#endregion
		//#region node_modules/@phosphor-icons/react/dist/csr/UploadSimple.es.js
		const e$1 = react.forwardRef((a, m) => /* @__PURE__ */ react.createElement(p, {
			ref: m,
			...a,
			weights: e$2
		}));
		e$1.displayName = "UploadSimpleIcon";
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
		const css$1 = ".VqXecW_root{box-sizing:border-box;width:100%;height:100%;min-height:0;color:var(--dsw-alias-label-primary);display:block;position:relative;overflow:hidden}.VqXecW_home{overflow-anchor:none;overscroll-behavior:contain;grid-template-rows:auto minmax(0,1fr);width:100%;height:100%;min-height:0;display:grid;overflow:hidden}.VqXecW_home[hidden],.VqXecW_browser[hidden]{display:none!important}.VqXecW_homeHeader{gap:14px;padding:22px 24px 16px;display:grid;container-type:inline-size}.VqXecW_homeHeader>span{box-sizing:border-box;min-width:0;height:44px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;align-items:center;gap:8px;padding:0 14px;display:flex}.VqXecW_homeHeader>span:focus-within{border-color:var(--dsw-alias-border-l1)}.VqXecW_homeHeader>span input{min-width:0;color:var(--dsw-alias-label-primary);background:0 0;border:0;outline:0;flex:1}.VqXecW_homeHeader>span input::placeholder{color:var(--dsw-alias-label-caption)}.VqXecW_homeHeader>.VqXecW_homeSearchPlaceholder{display:none}.VqXecW_homeHeader[data-compact=true]{grid-template-rows:48px;grid-template-columns:minmax(0,auto) auto minmax(0,1fr);align-items:center;column-gap:12px}.VqXecW_homeHeader[data-compact=true] .VqXecW_homeTitleRow{display:contents}.VqXecW_homeHeader[data-compact=true] .VqXecW_homeTitleRow>div:first-child{grid-area:1/1;min-width:0;overflow:hidden}.VqXecW_homeHeader[data-compact=true] .VqXecW_homeTitleRow>div:first-child p{display:none}.VqXecW_homeHeader[data-compact=true] .VqXecW_homeTitleRow>div:first-child h2{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.VqXecW_homeHeader[data-compact=true]>.VqXecW_homeSearch{z-index:1;grid-area:1/3;width:100%;min-width:0;max-width:100%;height:38px}.VqXecW_homeHeader[data-compact=true] .VqXecW_homeActions{z-index:2;white-space:nowrap;flex:none;grid-area:1/2;min-width:0}.VqXecW_homeHeader[data-compact=true] .VqXecW_homeActions>*{flex:none}.VqXecW_homeHeader[data-compact=true]>.VqXecW_homeSearchPlaceholder{display:none}.VqXecW_homeOperation{grid-column:1/-1;min-width:0}.VqXecW_homeTitleRow{justify-content:space-between;align-items:center;gap:16px;min-width:0;display:flex}.VqXecW_homeTitleRow h2,.VqXecW_homeTitleRow p,.VqXecW_homeSectionTitle h3{margin:0}.VqXecW_homeTitleRow h2{font-size:20px;font-weight:600;line-height:28px}.VqXecW_homeTitleRow p{color:var(--dsw-alias-label-secondary);margin-top:2px;font-size:12px;line-height:18px}.VqXecW_homeActions{align-items:center;gap:8px;display:flex}.VqXecW_homeGithubAction{box-sizing:border-box;border-radius:14px;width:28px;min-width:28px;height:28px;padding:0;transition:width .14s,padding .14s;overflow:hidden}.VqXecW_homeGithubLabel{white-space:nowrap;display:none}.VqXecW_homeGithubAction:hover,.VqXecW_homeGithubAction:focus-visible{width:78px;padding-inline:10px}.VqXecW_homeGithubAction:hover .VqXecW_homeGithubLabel,.VqXecW_homeGithubAction:focus-visible .VqXecW_homeGithubLabel{display:inline}.VqXecW_homeContent{overflow-anchor:none;overscroll-behavior:contain;scrollbar-gutter:stable;-webkit-overflow-scrolling:touch;gap:30px;min-height:0;margin-top:12px;padding:24px 24px 38px;display:grid;overflow-y:auto}.VqXecW_homeSection{min-width:0}.VqXecW_homeSectionTitle{justify-content:space-between;align-items:center;gap:14px;min-height:28px;margin-bottom:12px;display:flex}.VqXecW_homeSectionTitle h3{font-size:15px;font-weight:600;line-height:22px}.VqXecW_homeSectionTitle>span{color:var(--dsw-alias-label-caption);font-size:11px;line-height:17px}.VqXecW_installedRow{grid-template-columns:repeat(var(--installed-columns), minmax(0, 1fr));gap:20px;display:grid;overflow:hidden}.VqXecW_homeCard{box-sizing:border-box;cursor:pointer;text-align:left;width:100%;min-width:0;height:auto;min-height:0;color:inherit;border:1px solid var(--dsw-alias-border-l2);font:inherit;box-shadow:0 0 0 0 color-mix(in srgb, var(--dsw-alias-brand-primary) 0%, transparent), 0 0 0 color-mix(in srgb, var(--dsw-alias-brand-primary) 0%, transparent);background:0 0;border-radius:10px;grid-template-columns:minmax(0,1fr);padding:0;transition:border-color .22s,background .22s,box-shadow .26s ease-out;display:grid;position:relative;overflow:hidden}.VqXecW_homeCard:hover,.VqXecW_homeCard:focus-within{border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 34%, var(--dsw-alias-border-l1));box-shadow:0 0 0 1px color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent), 0 0 10px color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)}.VqXecW_homeCardOpen{z-index:0;width:100%;min-width:0;color:inherit;border-radius:inherit;background:var(--dsw-alias-bg-layer-1);text-align:left;border:0;flex-direction:column;grid-area:1/1;align-self:stretch;align-items:stretch;padding:0;display:flex;height:auto!important;min-height:0!important;max-height:none!important}.VqXecW_homeCardOpen:hover,.VqXecW_homeCardOpen:focus-visible,.VqXecW_homeCardOpen:active{border-radius:inherit;background:var(--dsw-alias-interactive-bg-hover)}.VqXecW_homeCard[data-active=true] .VqXecW_homeCardOpen{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 4%, var(--dsw-alias-bg-layer-1))}.VqXecW_homeCardMedia{background:var(--dsw-alias-bg-layer-2);flex:none;width:100%;height:clamp(180px,18vw,220px);max-height:220px;display:block;overflow:hidden}.VqXecW_homeCardMedia>img,.VqXecW_homeCardMedia>.VqXecW_previewPlaceholder,.VqXecW_homeCardMedia>img{object-fit:cover;object-position:center;width:100%;height:100%;display:block}.VqXecW_homeCardCopy{box-sizing:border-box;flex-direction:column;flex:1;justify-content:flex-start;gap:6px;width:100%;min-width:0;padding:12px 14px 44px;display:flex}.VqXecW_homeCardTitleRow{justify-content:space-between;align-items:flex-start;gap:8px;min-width:0;display:flex}.VqXecW_homeCardTitleRow>strong{text-overflow:ellipsis;white-space:normal;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;flex:1;min-width:0;font-size:13px;font-weight:550;line-height:19px;display:-webkit-box;overflow:hidden}.VqXecW_homeCardDescription{color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:normal;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;font-size:11px;line-height:17px;display:-webkit-box;overflow:hidden}.VqXecW_homeCardFooter{z-index:1;min-width:0;min-height:24px;color:var(--dsw-alias-label-caption);align-items:center;gap:8px;padding:0 6px 10px 12px;font-size:11px;line-height:17px;display:flex;position:absolute;bottom:0;left:0;right:0}.VqXecW_homeCardRepo{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.VqXecW_feedMeta{white-space:nowrap;flex:none;align-items:center;gap:4px;display:inline-flex}.VqXecW_cardInlineActions{flex:none;align-items:center;gap:4px;min-width:0;display:inline-flex}.VqXecW_cardAction{flex:none;height:24px;min-height:24px;padding-inline:8px;font-size:11px;line-height:16px}.VqXecW_cardActionProgress{min-height:24px;color:var(--dsw-alias-label-caption);align-items:center;gap:4px;font-size:11px;line-height:17px;display:inline-flex}.VqXecW_cardActionProgress svg{width:13px;height:13px;animation:1s linear infinite VqXecW_spin}.VqXecW_installedMoreCard{min-height:0;color:var(--dsw-alias-label-secondary);text-align:center;background:0 0;justify-content:center;align-items:center;gap:9px;display:flex}.VqXecW_installedMoreCard strong{font-size:13px;font-weight:550;line-height:19px}.VqXecW_installedSkeletonCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;display:grid;overflow:hidden}.VqXecW_installedSkeletonCard>span:first-child{width:100%;height:clamp(106px,11vw,148px);max-height:148px;display:block}.VqXecW_installedSkeletonCard>span:last-child{gap:7px;padding:11px 14px 12px;display:grid}.VqXecW_installedSkeletonCard i{border-radius:6px;height:11px;display:block}.VqXecW_installedSkeletonCard i:first-child{width:76%}.VqXecW_installedSkeletonCard i:last-child{width:48%;height:9px}.VqXecW_installedSkeletonCard>span:first-child,.VqXecW_installedSkeletonCard i{background:linear-gradient(90deg, var(--dsw-alias-bg-layer-1) 25%, var(--dsw-alias-interactive-bg-hover) 50%, var(--dsw-alias-bg-layer-1) 75%);background-size:200% 100%;animation:1.4s ease-in-out infinite VqXecW_skeletonShimmer}.VqXecW_discoveryGrid{grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;display:grid}.VqXecW_discoveryGrid .VqXecW_homeCard{height:100%}.VqXecW_installedRow .VqXecW_homeCardMedia{height:clamp(106px,11vw,148px);max-height:148px}.VqXecW_homeLoading{min-height:220px;color:var(--dsw-alias-label-secondary);justify-content:center;align-items:center;gap:7px;font-size:13px;line-height:20px;display:flex}.VqXecW_homeLoading svg{animation:1s linear infinite VqXecW_spin}.VqXecW_homeLoadMore{gap:6px;padding:2px 8px 0;display:grid}.VqXecW_homeLoadMore span{background:var(--dsw-alias-bg-layer-1);border-radius:4px;height:4px;display:block}.VqXecW_homeLoadMore span:first-child{width:72%}.VqXecW_homeLoadMore span:last-child{width:46%}.VqXecW_homeError{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-tertiary);border-radius:8px;margin-top:12px;padding:10px 12px;font-size:12px;line-height:18px}.VqXecW_browserModal{box-sizing:border-box;width:min(1080px,100vw - 48px);max-width:calc(100vw - 48px);height:min(720px,100vh - 48px);max-height:calc(100vh - 48px);padding:0;overflow:hidden}.VqXecW_browserContent{flex-direction:column;flex:1;min-width:0;min-height:0;display:flex;overflow:hidden}.VqXecW_browserContent>:last-child{flex:1;min-width:0;min-height:0;display:flex;overflow:hidden}.VqXecW_browser{background:0 0;place-items:stretch stretch;width:100%;height:100%;display:grid;position:relative;overflow:hidden}.VqXecW_browserPanel{width:100%;min-width:0;height:100%;min-height:0;box-shadow:none;background:0 0;border:0;border-radius:0;grid-template-columns:300px minmax(0,1fr);display:grid;position:relative;overflow:hidden}.VqXecW_browserHomeBack{align-self:flex-start;display:none}.VqXecW_srOnly{clip:rect(0, 0, 0, 0)!important;white-space:nowrap!important;border:0!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;position:absolute!important;overflow:hidden!important}.VqXecW_catalog{border-right:1px solid var(--dsw-alias-border-l2);flex-direction:column;min-width:0;min-height:0;display:flex}.VqXecW_catalogHeader{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:14px;padding:24px 22px 10px;display:flex}.VqXecW_catalogHeader h2,.VqXecW_detail h2,.VqXecW_detail h3,.VqXecW_catalogHeader p,.VqXecW_detail p{margin:0}.VqXecW_catalogHeader h2{margin-bottom:2px;font-size:20px;font-weight:600;line-height:28px}.VqXecW_catalogHeader p{color:var(--dsw-alias-label-secondary);margin-top:2px;font-size:12px;line-height:18px}.VqXecW_catalogTitle{justify-content:space-between;align-items:center;gap:12px;display:flex}.VqXecW_catalogTitleMain{align-items:center;gap:7px;min-width:0;display:flex}.VqXecW_root .VqXecW_marketUpdateButton{border-radius:14px;justify-content:center;align-items:center;width:28px;min-width:28px;height:28px;min-height:28px;padding:0;transition:width .14s,padding .14s;display:inline-flex;overflow:hidden}.VqXecW_marketUpdateLabel{white-space:nowrap;display:none}.VqXecW_root .VqXecW_marketUpdateButton:hover,.VqXecW_root .VqXecW_marketUpdateButton:focus-visible{width:68px;padding-inline:10px}.VqXecW_root .VqXecW_marketUpdateButton[data-updating=true]{width:78px;padding-inline:10px}.VqXecW_root .VqXecW_marketUpdateButton:hover .VqXecW_marketUpdateLabel,.VqXecW_root .VqXecW_marketUpdateButton:focus-visible .VqXecW_marketUpdateLabel,.VqXecW_root .VqXecW_marketUpdateButton[data-updating=true] .VqXecW_marketUpdateLabel{display:inline}.VqXecW_catalogHeader>span{height:48px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);background:0 0;border-radius:10px;align-items:center;gap:8px;padding:0 14px;display:flex}.VqXecW_catalogHeader>span:focus-within{border-color:var(--dsw-alias-border-l1)}.VqXecW_catalogHeader>span input{min-width:0;color:var(--dsw-alias-label-primary);background:0 0;border:0;outline:0;flex:1}.VqXecW_catalogHeader>span input::placeholder{color:var(--dsw-alias-label-caption)}.VqXecW_filterBar{justify-content:space-between;align-items:center;gap:8px;display:flex}.VqXecW_filters{flex-wrap:wrap;gap:4px;display:flex}.VqXecW_filterPill,.VqXecW_sortButton{flex:none}.VqXecW_skinList{overscroll-behavior:contain;scrollbar-gutter:stable;touch-action:pan-y;-webkit-overflow-scrolling:touch;flex-direction:column;flex:1 1 0;gap:4px;height:0;min-height:0;margin:0;padding:8px 12px 16px;display:flex;overflow:hidden auto}.VqXecW_skinCard{box-sizing:border-box;cursor:pointer;text-align:left;width:100%;min-height:72px;color:inherit;font:inherit;background:0 0;border:0;border-radius:8px;align-items:center;gap:12px;padding:8px;display:flex}.VqXecW_skinCard:hover{background:var(--dsw-specific-sidebar-nav-item-hover,var(--dsw-alias-interactive-bg-hover))}.VqXecW_externalPlugin{cursor:default;border:1px dashed var(--dsw-alias-border-l2);min-height:58px}.VqXecW_skinCard[data-selected=true]{background:var(--dsw-specific-sidebar-nav-item-active,var(--dsw-alias-button-ghost-active-fill));box-shadow:inset 0 0 0 1px var(--dsw-alias-button-ghost-active-border)}.VqXecW_skinCardPreview{background:var(--dsw-alias-bg-layer-3);border-radius:7px;flex:none;width:56px;height:56px;display:block;overflow:hidden}.VqXecW_skinCardPreview>img{object-fit:cover;opacity:.35;width:100%;height:100%;transition:opacity .18s ease-out,transform .24s ease-out;display:block}.VqXecW_skinCardPreview>img[data-loaded=true]{opacity:1}.VqXecW_skinCardPreview>.VqXecW_previewPlaceholder{width:100%;height:100%}.VqXecW_previewPlaceholder{box-sizing:border-box;min-width:0;color:var(--dsw-alias-label-caption);background:linear-gradient(145deg, var(--dsw-alias-bg-layer-2), var(--dsw-alias-bg-layer-1));text-align:center;flex-direction:column;justify-content:center;align-items:center;gap:4px;display:flex;overflow:hidden}.VqXecW_previewPlaceholder strong{max-width:88%;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:500;line-height:18px;display:block;overflow:hidden}.VqXecW_previewPlaceholder small{color:var(--dsw-alias-label-caption);font-size:10px;line-height:15px}.VqXecW_previewPlaceholder[data-preview-kind=list]{border-radius:7px;flex:none;width:56px;height:56px}.VqXecW_previewPlaceholder[data-preview-kind=list] strong{font-size:9px;line-height:12px}.VqXecW_previewPlaceholder[data-preview-kind=list] small{display:none}.VqXecW_mediaLazyPlaceholder{background:var(--dsw-alias-bg-layer-2);width:100%;height:100%;min-height:1px;display:block}.VqXecW_skinCardBody{flex-direction:column;flex:1;min-width:0;display:flex}.VqXecW_cardTitle{text-overflow:ellipsis;white-space:normal;-webkit-line-clamp:1;line-clamp:1;-webkit-box-orient:vertical;font-size:14px;font-weight:400;line-height:22px;display:-webkit-box;overflow:hidden}.VqXecW_cardDescription{color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:normal;-webkit-line-clamp:1;line-clamp:1;-webkit-box-orient:vertical;font-size:11px;line-height:17px;display:-webkit-box;overflow:hidden}.VqXecW_cardMetaLine{min-width:0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));align-items:center;gap:8px;font-size:12px;line-height:18px;display:flex}.VqXecW_cardMeta{white-space:nowrap;text-overflow:ellipsis;min-width:0;overflow:hidden}.VqXecW_cardStars{white-space:nowrap;flex:none;align-items:center;gap:3px;display:inline-flex}.VqXecW_statusLabel{min-width:0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));white-space:nowrap;align-items:center;font-size:11px;font-weight:400;line-height:17px;display:inline-flex}.VqXecW_statusLabel[data-active=true]{color:var(--dsw-alias-state-success-primary)}.VqXecW_listSkeleton{gap:4px;display:grid}.VqXecW_skeletonCard{align-items:center;gap:12px;min-height:72px;padding:8px;display:flex}.VqXecW_skeletonCard>span:first-child{border-radius:7px;flex:none;width:56px;height:56px}.VqXecW_skeletonCard>span:nth-child(2){flex:1;gap:8px;min-width:0;display:grid}.VqXecW_skeletonCard>span:nth-child(2) i:first-child{width:62%;height:14px}.VqXecW_skeletonCard>span:nth-child(2) i:last-child{width:42%;height:10px}.VqXecW_skeletonCard>i{border-radius:5px;width:42px;height:18px}.VqXecW_skeletonCard span:first-child,.VqXecW_skeletonCard i,.VqXecW_detailSkeleton span,.VqXecW_detailSkeleton i,.VqXecW_loadMoreHint span{background:linear-gradient(90deg, var(--dsw-alias-bg-layer-1) 25%, var(--dsw-alias-interactive-bg-hover) 50%, var(--dsw-alias-bg-layer-1) 75%);background-size:200% 100%;border-radius:6px;animation:1.4s ease-in-out infinite VqXecW_skeletonShimmer;display:block}.VqXecW_loadMoreHint{gap:6px;padding:10px 8px 2px;display:grid}.VqXecW_loadMoreHint span{height:4px}.VqXecW_loadMoreHint span:first-child{width:72%}.VqXecW_loadMoreHint span:last-child{width:46%}.VqXecW_detailSkeleton{gap:16px;display:grid}.VqXecW_detailSkeleton>div{gap:20px;display:flex}.VqXecW_detailSkeleton>div span{border-radius:9px;flex:none;width:138px;height:138px}.VqXecW_detailSkeleton>div i{width:min(420px,58%);height:72px;margin-top:12px}.VqXecW_detailSkeleton>span{width:100%;height:42px}.VqXecW_detailSkeleton>span:nth-child(3){height:min(340px,34vh)}.VqXecW_detailSkeleton>span:last-child{width:76%;height:110px}.VqXecW_detail{flex-direction:column;gap:14px;min-width:0;min-height:0;padding:32px 28px 28px;display:flex;overflow-y:auto}.VqXecW_detail>*{flex:none}.VqXecW_mobileBack{order:0;align-self:flex-start;display:none}.VqXecW_galleryGroup{order:4;gap:8px;display:grid}.VqXecW_hero{aspect-ratio:16/8;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;width:100%;position:relative;overflow:hidden}.VqXecW_heroOpen{cursor:zoom-in;width:100%;height:100%;color:inherit;background:0 0;border:0;padding:0;display:block}.VqXecW_hero img{object-fit:cover;width:100%;height:100%;display:block}.VqXecW_heroOpen>.VqXecW_previewPlaceholder{width:100%;height:100%}.VqXecW_heroOpen>.VqXecW_previewPlaceholder strong{font-size:16px;line-height:24px}.VqXecW_heroNav{z-index:2;cursor:pointer;color:#ffffffd1;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);opacity:.78;background:#0f10136b;border:1px solid #ffffff24;border-radius:50%;place-items:center;width:44px;min-width:44px;height:44px;min-height:44px;padding:0;transition:opacity .18s,background .18s,transform .18s;display:grid;position:absolute;top:50%;transform:translateY(-50%);box-shadow:0 4px 18px #00000029}.VqXecW_heroNav:hover{color:#fff;opacity:1;background:#1c1e23ad;transform:translateY(-50%)scale(1.04)}.VqXecW_heroPrev{left:12px}.VqXecW_heroNext{right:12px}.VqXecW_heroNext svg{transform:rotate(180deg)}.VqXecW_thumbnails{gap:8px;display:flex;overflow-x:auto}.VqXecW_thumbnailFrame{border-radius:8px;flex:none;width:112px;position:relative}.VqXecW_thumbnailFrame>button{box-sizing:border-box;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);opacity:.62;background:0 0;border-radius:8px;width:100%;padding:0;display:block;position:relative;overflow:hidden}.VqXecW_thumbnailFrame>button[data-selected=true]{border-color:var(--dsw-alias-brand-primary);opacity:1}.VqXecW_thumbnailFrame img{aspect-ratio:16/9;object-fit:cover;width:100%;display:block}.VqXecW_thumbnailFrame .VqXecW_previewPlaceholder{aspect-ratio:16/9;width:100%}.VqXecW_thumbnailFrame .VqXecW_mediaLazyPlaceholder{border-radius:0}.VqXecW_thumbnailProgress{z-index:1;pointer-events:none;transform-origin:0;background:#0000003d;transition:transform .24s ease-in;animation:5.6s linear forwards VqXecW_galleryProgress;position:absolute;inset:0;transform:scaleX(0)}.VqXecW_galleryGroup[data-paused=true] .VqXecW_thumbnailProgress{animation:none;transform:scaleX(0)}.VqXecW_lightbox{box-sizing:border-box;z-index:10000;color:#fff;-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);background:#050608f0;display:grid;position:fixed;inset:0;overflow:hidden}.VqXecW_lightboxStage{cursor:zoom-out;min-width:0;min-height:0;color:inherit;background:0 0;border:0;place-items:center;padding:0;display:grid;position:absolute;inset:22px 58px 94px}.VqXecW_lightboxStage img{object-fit:contain;width:100%;height:100%;display:block}.VqXecW_lightboxStage>.VqXecW_previewPlaceholder{width:100%;height:100%}.VqXecW_lightboxClose{z-index:3;top:max(16px, env(safe-area-inset-top));right:max(16px, env(safe-area-inset-right));cursor:pointer;color:#ffffffc7;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);background:#14151899;border:1px solid #ffffff1f;border-radius:22px;place-items:center;width:44px;min-width:44px;height:44px;min-height:44px;padding:0;display:grid;position:absolute}.VqXecW_lightboxClose:hover{color:#fff;background:#2d2f35b8}.VqXecW_lightboxNav{z-index:2;cursor:pointer;color:#ffffff9e;background:0 0;border:0;border-radius:0;place-items:center;width:clamp(48px,5vw,72px);min-width:0;height:auto;min-height:44px;padding:0;transition:color .18s,background .18s;display:grid;position:absolute;top:0;bottom:86px}.VqXecW_lightboxNav:hover{color:#fff;background:#ffffff09}.VqXecW_lightboxPrev{left:0}.VqXecW_lightboxNext{right:0}.VqXecW_lightboxNext svg{transform:rotate(180deg)}.VqXecW_lightboxThumbnails{z-index:2;right:64px;bottom:max(18px, env(safe-area-inset-bottom));justify-content:center;gap:8px;display:flex;position:absolute;left:64px;overflow-x:auto}.VqXecW_lightboxThumbnails button{cursor:pointer;opacity:.52;background:#111216;border:1px solid #ffffff29;border-radius:7px;flex:none;width:88px;min-width:88px;height:auto;min-height:0;padding:0;overflow:hidden}.VqXecW_lightboxThumbnails button[data-selected=true]{opacity:1;border-color:#ffffffb8}.VqXecW_lightboxThumbnails img,.VqXecW_lightboxThumbnails .VqXecW_previewPlaceholder{aspect-ratio:16/9;object-fit:cover;width:100%;display:block}.VqXecW_detailHeader{border-bottom:1px solid var(--dsw-alias-border-l2);order:1;grid-template-columns:138px minmax(0,1fr);align-items:start;gap:22px;padding:0 4px 16px;display:grid}.VqXecW_skinAvatar{background:var(--dsw-alias-bg-layer-1);border-radius:9px;width:138px;height:138px;display:block;overflow:hidden}.VqXecW_skinAvatar>img,.VqXecW_skinAvatar>.VqXecW_previewPlaceholder{object-fit:cover;width:100%;height:100%;display:block}.VqXecW_titleBlock{min-width:0;padding-top:10px}.VqXecW_titleBlock h2{letter-spacing:-.01em;text-overflow:ellipsis;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;font-size:23px;font-weight:620;line-height:31px;display:-webkit-box;overflow:hidden}.VqXecW_titleBlock .VqXecW_description{max-width:520px;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;margin-top:7px;font-size:13px;line-height:21px;display:-webkit-box;overflow:hidden}.VqXecW_titleBlock .VqXecW_author{color:var(--dsw-alias-label-caption);margin-top:4px;font-size:11px;line-height:18px}.VqXecW_titleBlock .VqXecW_version{min-width:0;color:var(--dsw-alias-label-caption);align-items:center;gap:7px;margin-top:8px;font-size:12px;line-height:22px;display:flex}.VqXecW_actionRow{border-bottom:1px solid var(--dsw-alias-border-l2);flex-wrap:wrap;order:2;align-items:center;gap:9px;min-height:42px;padding:0 4px 12px;display:flex}.VqXecW_pinWarning{color:var(--dsw-alias-label-secondary);margin:12px 0 0;line-height:1.6}.VqXecW_pinWarning a{color:var(--dsw-alias-interactive-label-primary);text-underline-offset:2px;text-decoration:underline}.VqXecW_installOptions{gap:12px;display:grid}.VqXecW_installOptions>div{gap:6px;display:grid}.VqXecW_installOptions strong{font-size:12px;font-weight:550}.VqXecW_installOptions small{color:var(--dsw-alias-label-caption);font-size:11px;line-height:17px}.VqXecW_installOptions>.VqXecW_manualInstallGuide{border:1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, var(--dsw-alias-bg-layer-1));border-radius:12px;align-content:center;gap:7px;min-height:108px;padding:13px 14px;display:grid}.VqXecW_manualInstallGuide p{color:var(--dsw-alias-label-secondary);margin:0;font-size:11px;line-height:18px}.VqXecW_manualInstallGuide a{width:fit-content;color:var(--dsw-alias-link-primary,var(--dsw-alias-brand-primary));align-items:center;gap:5px;font-size:11px;line-height:18px;text-decoration:none;display:inline-flex}.VqXecW_manualInstallGuide a:hover{text-underline-offset:2px;text-decoration:underline}.VqXecW_copyCapsule{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:17px;align-items:center;min-width:0;padding-left:12px;display:flex}.VqXecW_copyCapsule code{min-width:0;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;flex:1;font:11px/32px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;overflow:hidden}.VqXecW_copyCapsule .VqXecW_copyCapsuleButton{flex:none}.VqXecW_stars{color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none;align-items:center;gap:5px;font-size:12px;line-height:20px;display:inline-flex}.VqXecW_actionDivider{background:var(--dsw-alias-border-l2);width:1px;height:22px;margin:0 3px}.VqXecW_repoMeta{flex:220px;align-items:center;gap:10px;min-width:0;display:flex}.VqXecW_repoLink{min-width:0;color:var(--dsw-alias-link-primary,var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary)));align-items:center;gap:5px;font-size:12px;line-height:20px;text-decoration:none;display:inline-flex}.VqXecW_repoLink>svg{flex:none}.VqXecW_repoLink>span{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.VqXecW_repoLink:hover{text-decoration:underline}.VqXecW_iconOnlyButton{flex:none}.VqXecW_operation,.VqXecW_error{border-radius:10px;order:3;padding:9px 12px;font-size:12px;line-height:18px}.VqXecW_operation{min-width:0;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);align-items:center;gap:7px;display:flex;overflow:hidden}.VqXecW_operation>svg{flex:none;animation:1s linear infinite VqXecW_spin}.VqXecW_operation[data-terminal=true]>svg{animation:none}.VqXecW_operation[data-terminal=true]{background:var(--dsw-alias-bg-layer-1)}.VqXecW_operation[data-failed=true]{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-tertiary)}.VqXecW_operation strong{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:0 auto;font-weight:600;overflow:hidden}.VqXecW_operationMeta{white-space:nowrap;flex:0 auto;align-items:center;gap:7px;min-width:0;display:flex;overflow:hidden}.VqXecW_operationMeta small{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;flex:none;font-size:12px}.VqXecW_operationMessage{min-width:0;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;flex:auto;overflow:hidden}.VqXecW_operation[data-failed=true] .VqXecW_operationMessage{color:var(--dsw-alias-state-error-primary);font-weight:550}.VqXecW_operationActions{flex:none;align-items:center;gap:6px;min-width:0;margin-left:auto;display:flex}.VqXecW_operation .VqXecW_operationCancel,.VqXecW_operation .VqXecW_operationDismiss,.VqXecW_operation .VqXecW_operationCopyLog{flex:none;margin-left:0}.VqXecW_error{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-tertiary)}.VqXecW_aboutGrid{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;order:6;grid-template-columns:minmax(0,1fr) minmax(260px,1fr);display:grid}.VqXecW_aboutGrid>*{padding:16px 18px}.VqXecW_aboutGrid>aside{border-left:1px solid var(--dsw-alias-border-l2)}.VqXecW_aboutGrid h3,.VqXecW_recommendations h3{margin-bottom:10px;font-size:14px;font-weight:600;line-height:22px}.VqXecW_aboutGrid article>p{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:21px}.VqXecW_tags{flex-wrap:wrap;gap:6px;margin-top:12px;display:flex}.VqXecW_aboutGrid dl{margin:12px 0 0}.VqXecW_aboutGrid dl div{border-bottom:1px solid var(--dsw-alias-border-l3);justify-content:space-between;gap:12px;padding:7px 0;font-size:12px;line-height:18px;display:flex}.VqXecW_aboutGrid dt{color:var(--dsw-alias-label-caption)}.VqXecW_aboutGrid dd{text-align:right;color:var(--dsw-alias-label-secondary);margin:0}.VqXecW_notice{color:var(--dsw-alias-state-warning-primary);font-size:11px;line-height:17px;margin-top:10px!important}.VqXecW_notice a{color:inherit;text-underline-offset:2px;text-decoration:underline}.VqXecW_changelog ol{gap:8px;margin:0 0 12px;padding:0;list-style:none;display:grid}.VqXecW_changelog li{color:var(--dsw-alias-label-secondary);grid-template-columns:64px minmax(0,1fr);gap:10px;font-size:12px;line-height:18px;display:grid}.VqXecW_changelog strong{color:var(--dsw-alias-label-caption);font-weight:500}.VqXecW_changelog a{color:var(--dsw-alias-label-primary);font-size:12px;text-decoration:none}.VqXecW_changelog a:hover{text-decoration:underline}.VqXecW_healthList span[data-health=pass]{color:var(--dsw-alias-state-success-primary,#2f9e63)}.VqXecW_healthList span[data-health=improve]{color:var(--dsw-alias-state-warning-primary)}.VqXecW_healthSuggestion{color:var(--dsw-alias-label-secondary);margin:8px 0 0;font-size:11px;line-height:17px}.VqXecW_collectionTitle{border-top:1px solid var(--dsw-alias-border-l3);margin-top:18px;padding-top:14px}.VqXecW_recommendations{border-top:1px solid var(--dsw-alias-border-l2);order:7;padding-top:18px}.VqXecW_recommendations>div{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;display:grid}.VqXecW_recommendations .VqXecW_homeCard{height:100%}.VqXecW_loading,.VqXecW_listLoading,.VqXecW_empty{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.VqXecW_loading{align-items:center;gap:7px;margin:auto;display:flex}.VqXecW_listLoading{justify-content:center;align-items:center;gap:7px;padding:24px 8px;display:flex}.VqXecW_loading svg,.VqXecW_listLoading svg{animation:1s linear infinite VqXecW_spin}.VqXecW_empty{text-align:center;padding:24px 8px}.VqXecW_submission{gap:10px;width:100%;min-width:0;max-width:100%;display:grid}.VqXecW_submission small{color:var(--dsw-alias-label-caption);margin:0;font-size:12px;line-height:18px}.VqXecW_submission textarea{box-sizing:border-box;resize:vertical;width:100%;min-width:0;max-width:100%;min-height:300px;color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;outline:none;padding:12px;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.VqXecW_submission textarea:focus{border-color:var(--dsw-alias-brand-primary)}@keyframes VqXecW_spin{to{transform:rotate(360deg)}}@keyframes VqXecW_skeletonShimmer{to{background-position:-200% 0}}@keyframes VqXecW_galleryProgress{to{transform:scaleX(1)}}@media (prefers-reduced-motion:reduce){.VqXecW_skeletonCard span:first-child,.VqXecW_skeletonCard i,.VqXecW_installedSkeletonCard>span:first-child,.VqXecW_installedSkeletonCard i,.VqXecW_detailSkeleton span,.VqXecW_detailSkeleton i,.VqXecW_loadMoreHint span{animation:none}.VqXecW_skinCard>img{transition:none}.VqXecW_homeLoading svg{animation:none}.VqXecW_homeCard{transition:none}.VqXecW_thumbnailProgress{animation:none;display:none}.VqXecW_hero img,.VqXecW_heroNav{transition:none}.VqXecW_hero:hover .VqXecW_heroOpen img{transform:none}}@media (width<=959px){.VqXecW_root{height:100%;min-height:0;max-height:100%;display:block;overflow:hidden}.VqXecW_homeHeader{padding:18px 16px 14px}.VqXecW_homeHeader[data-compact=true]{grid-template-columns:minmax(0,auto) auto minmax(0,1fr);column-gap:8px}.VqXecW_homeHeader[data-compact=true] .VqXecW_homeTitleRow h2{font-size:17px;line-height:24px}.VqXecW_homeHeader[data-compact=true] .VqXecW_homeActions .VqXecW_homeGithubAction,.VqXecW_homeHeader[data-compact=true] .VqXecW_homeActions .VqXecW_homeSubmitAction{display:none}.VqXecW_homeContent{gap:24px;padding:20px 16px 30px}.VqXecW_homeSectionTitle>span{display:none}.VqXecW_installedRow{gap:16px}.VqXecW_discoveryGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.VqXecW_homeCardCopy{padding:9px 12px 44px}.VqXecW_homeCardFooter{gap:6px;padding-left:12px;padding-right:6px}.VqXecW_homeCardMedia{height:160px;max-height:160px}.VqXecW_installedRow .VqXecW_homeCardMedia,.VqXecW_installedSkeletonCard>span:first-child{height:104px;max-height:104px}.VqXecW_browserModal{border-radius:0;width:100vw;max-width:100vw;height:100vh;max-height:100vh}.VqXecW_browser{background:var(--dsw-alias-bg-layer-2);-webkit-backdrop-filter:none;backdrop-filter:none;display:block}.VqXecW_browserPanel{width:100%;height:100%;box-shadow:none;border:0;border-radius:0;display:block}.VqXecW_browserHomeBack{display:inline-flex}.VqXecW_catalog{border-right:0;height:100%;min-height:0;overflow:hidden}.VqXecW_detail{overscroll-behavior:contain;-webkit-overflow-scrolling:touch;height:100%;min-height:0;display:none;overflow-y:auto}.VqXecW_browser[data-detail=open] .VqXecW_catalog{display:none}.VqXecW_browser[data-detail=open] .VqXecW_detail{display:flex}.VqXecW_mobileBack{display:inline-flex}.VqXecW_detailHeader{grid-template-columns:76px minmax(0,1fr);align-items:start;gap:14px;display:grid}.VqXecW_skinAvatar{width:76px;height:76px}.VqXecW_titleBlock{padding-top:0}.VqXecW_titleBlock h2{font-size:20px;line-height:27px}.VqXecW_titleBlock .VqXecW_description{margin-top:7px}.VqXecW_titleBlock .VqXecW_version{flex-wrap:wrap;row-gap:2px;margin-top:6px}.VqXecW_actionRow{justify-content:flex-start}.VqXecW_aboutGrid{grid-template-columns:1fr}.VqXecW_aboutGrid>aside{border-top:1px solid var(--dsw-alias-border-l2);border-left:0}.VqXecW_recommendations>div{grid-template-columns:1fr}.VqXecW_lightboxStage{inset:54px 44px 92px}.VqXecW_lightboxNav{width:44px;bottom:82px}.VqXecW_lightboxThumbnails{justify-content:flex-start;left:48px;right:48px}.VqXecW_lightboxThumbnails button{width:72px;min-width:72px}}@container (width<=760px){.VqXecW_homeHeader[data-compact=true] .VqXecW_homeSubmitAction{display:none}}@container (width<=620px){.VqXecW_homeHeader[data-compact=true] .VqXecW_homeGithubAction{display:none}}@container (width<=520px){.VqXecW_homeHeader[data-compact=true] .VqXecW_homeUpdateAction{display:none}}@media (width<=520px){.VqXecW_discoveryGrid{grid-template-columns:minmax(0,1fr)}}@media (prefers-reduced-motion:reduce){.VqXecW_operation svg,.VqXecW_loading svg,.VqXecW_listLoading svg{animation:none}}";
		const tagId$1 = "dsh-skin-market/SkinMarket.module.css";
		if (typeof document !== "undefined" && !document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]")) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-skin-market";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var SkinMarket_module_css_default = {
			"marketUpdateLabel": "VqXecW_marketUpdateLabel",
			"operationMeta": "VqXecW_operationMeta",
			"error": "VqXecW_error",
			"homeCardOpen": "VqXecW_homeCardOpen",
			"loading": "VqXecW_loading",
			"homeCardMedia": "VqXecW_homeCardMedia",
			"operationDismiss": "VqXecW_operationDismiss",
			"heroPrev": "VqXecW_heroPrev",
			"heroOpen": "VqXecW_heroOpen",
			"skinCard": "VqXecW_skinCard",
			"homeActions": "VqXecW_homeActions",
			"stars": "VqXecW_stars",
			"installedSkeletonCard": "VqXecW_installedSkeletonCard",
			"cardMeta": "VqXecW_cardMeta",
			"skeletonShimmer": "VqXecW_skeletonShimmer",
			"author": "VqXecW_author",
			"browserHomeBack": "VqXecW_browserHomeBack",
			"submission": "VqXecW_submission",
			"cardActionProgress": "VqXecW_cardActionProgress",
			"healthList": "VqXecW_healthList",
			"homeLoading": "VqXecW_homeLoading",
			"changelog": "VqXecW_changelog",
			"statusLabel": "VqXecW_statusLabel",
			"cardStars": "VqXecW_cardStars",
			"notice": "VqXecW_notice",
			"sortButton": "VqXecW_sortButton",
			"pinWarning": "VqXecW_pinWarning",
			"homeOperation": "VqXecW_homeOperation",
			"cardAction": "VqXecW_cardAction",
			"titleBlock": "VqXecW_titleBlock",
			"externalPlugin": "VqXecW_externalPlugin",
			"loadMoreHint": "VqXecW_loadMoreHint",
			"listSkeleton": "VqXecW_listSkeleton",
			"version": "VqXecW_version",
			"installedRow": "VqXecW_installedRow",
			"catalog": "VqXecW_catalog",
			"homeCardFooter": "VqXecW_homeCardFooter",
			"detail": "VqXecW_detail",
			"installedMoreCard": "VqXecW_installedMoreCard",
			"homeSectionTitle": "VqXecW_homeSectionTitle",
			"browserPanel": "VqXecW_browserPanel",
			"operationMessage": "VqXecW_operationMessage",
			"homeGithubAction": "VqXecW_homeGithubAction",
			"srOnly": "VqXecW_srOnly",
			"actionDivider": "VqXecW_actionDivider",
			"discoveryGrid": "VqXecW_discoveryGrid",
			"operationActions": "VqXecW_operationActions",
			"lightbox": "VqXecW_lightbox",
			"listLoading": "VqXecW_listLoading",
			"homeUpdateAction": "VqXecW_homeUpdateAction",
			"catalogTitleMain": "VqXecW_catalogTitleMain",
			"thumbnailProgress": "VqXecW_thumbnailProgress",
			"homeHeader": "VqXecW_homeHeader",
			"browser": "VqXecW_browser",
			"homeGithubLabel": "VqXecW_homeGithubLabel",
			"home": "VqXecW_home",
			"homeLoadMore": "VqXecW_homeLoadMore",
			"lightboxNext": "VqXecW_lightboxNext",
			"detailHeader": "VqXecW_detailHeader",
			"description": "VqXecW_description",
			"feedMeta": "VqXecW_feedMeta",
			"homeCard": "VqXecW_homeCard",
			"previewPlaceholder": "VqXecW_previewPlaceholder",
			"homeCardRepo": "VqXecW_homeCardRepo",
			"detailSkeleton": "VqXecW_detailSkeleton",
			"catalogHeader": "VqXecW_catalogHeader",
			"filters": "VqXecW_filters",
			"galleryGroup": "VqXecW_galleryGroup",
			"filterPill": "VqXecW_filterPill",
			"homeSearchPlaceholder": "VqXecW_homeSearchPlaceholder",
			"skeletonCard": "VqXecW_skeletonCard",
			"homeCardDescription": "VqXecW_homeCardDescription",
			"homeTitleRow": "VqXecW_homeTitleRow",
			"heroNext": "VqXecW_heroNext",
			"homeContent": "VqXecW_homeContent",
			"galleryProgress": "VqXecW_galleryProgress",
			"manualInstallGuide": "VqXecW_manualInstallGuide",
			"cardInlineActions": "VqXecW_cardInlineActions",
			"skinList": "VqXecW_skinList",
			"homeError": "VqXecW_homeError",
			"homeCardCopy": "VqXecW_homeCardCopy",
			"homeSearch": "VqXecW_homeSearch",
			"skinCardBody": "VqXecW_skinCardBody",
			"homeCardTitleRow": "VqXecW_homeCardTitleRow",
			"homeSection": "VqXecW_homeSection",
			"repoLink": "VqXecW_repoLink",
			"aboutGrid": "VqXecW_aboutGrid",
			"operationCopyLog": "VqXecW_operationCopyLog",
			"tags": "VqXecW_tags",
			"mediaLazyPlaceholder": "VqXecW_mediaLazyPlaceholder",
			"lightboxClose": "VqXecW_lightboxClose",
			"copyCapsuleButton": "VqXecW_copyCapsuleButton",
			"mobileBack": "VqXecW_mobileBack",
			"lightboxNav": "VqXecW_lightboxNav",
			"marketUpdateButton": "VqXecW_marketUpdateButton",
			"cardDescription": "VqXecW_cardDescription",
			"skinAvatar": "VqXecW_skinAvatar",
			"cardTitle": "VqXecW_cardTitle",
			"thumbnails": "VqXecW_thumbnails",
			"recommendations": "VqXecW_recommendations",
			"operationCancel": "VqXecW_operationCancel",
			"browserContent": "VqXecW_browserContent",
			"hero": "VqXecW_hero",
			"skinCardPreview": "VqXecW_skinCardPreview",
			"lightboxStage": "VqXecW_lightboxStage",
			"actionRow": "VqXecW_actionRow",
			"heroNav": "VqXecW_heroNav",
			"installOptions": "VqXecW_installOptions",
			"filterBar": "VqXecW_filterBar",
			"copyCapsule": "VqXecW_copyCapsule",
			"thumbnailFrame": "VqXecW_thumbnailFrame",
			"repoMeta": "VqXecW_repoMeta",
			"catalogTitle": "VqXecW_catalogTitle",
			"spin": "VqXecW_spin",
			"operation": "VqXecW_operation",
			"healthSuggestion": "VqXecW_healthSuggestion",
			"cardMetaLine": "VqXecW_cardMetaLine",
			"collectionTitle": "VqXecW_collectionTitle",
			"iconOnlyButton": "VqXecW_iconOnlyButton",
			"lightboxThumbnails": "VqXecW_lightboxThumbnails",
			"root": "VqXecW_root",
			"browserModal": "VqXecW_browserModal",
			"empty": "VqXecW_empty",
			"homeSubmitAction": "VqXecW_homeSubmitAction",
			"lightboxPrev": "VqXecW_lightboxPrev"
		};
		//#endregion
		//#region \0dsh-skin-market-css:/Users/leon/Code/liang-intensity-calibrator/code/dsh-skin-market/src/client/media-hover.module.css.mjs
		const css = ".dsh-skin-media-hover img{transition:opacity .18s ease-out,transform .24s ease-out}@media (hover:hover) and (pointer:fine){:is(.dsh-skin-media-hover:hover img,.dsh-skin-media-hover:focus-visible img){transform:scale(1.018)}}@media (prefers-reduced-motion:reduce){.dsh-skin-media-hover img{transition:none}:is(.dsh-skin-media-hover:hover img,.dsh-skin-media-hover:focus-visible img){transform:none}}";
		const tagId = "dsh-skin-market/media-hover.module.css";
		if (typeof document !== "undefined" && !document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]")) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-skin-market";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/catalog-order.ts
		function isRepositoryPreviewUrl(url) {
			return url.includes("opengraph.githubassets.com/") || url.includes("repository-images.githubusercontent.com/") || url.includes("dshfind.com/api/card");
		}
		function matchingScreenshots(upstreamScreenshots, subpath) {
			if (subpath === void 0 || subpath.trim() === "") return [];
			const normalizedSubpath = subpath.replace(/^\/+|\/+$/g, "");
			return upstreamScreenshots.filter((url) => {
				try {
					const pathname = decodeURIComponent(new URL(url).pathname).replace(/^\/+|\/+$/g, "");
					return pathname === normalizedSubpath || pathname.includes(`/${normalizedSubpath}/`) || pathname.endsWith(`/${normalizedSubpath}`);
				} catch {
					return false;
				}
			});
		}
		function scopedScreenshots(upstreamScreenshots, subpath) {
			const unique = [...new Set(upstreamScreenshots)];
			const scoped = matchingScreenshots(unique, subpath);
			return scoped.length > 0 ? scoped : unique;
		}
		function hasCrossPackageScreenshots(upstreamScreenshots, subpath) {
			const unique = [...new Set(upstreamScreenshots)];
			if (subpath === void 0 || unique.length === 0) return false;
			const scoped = matchingScreenshots(unique, subpath);
			return scoped.length > 0 && scoped.length < unique.length;
		}
		function usesMarketScreenshots(entry) {
			const market = entry.marketScreenshots ?? [];
			const upstream = entry.screenshots;
			const scopedUpstream = scopedScreenshots(upstream, entry.subpath);
			const hasUsableUpstream = entry.review?.preview !== "repository-card" && scopedUpstream.some((url) => !isRepositoryPreviewUrl(url));
			return market.length > 0 && (hasCrossPackageScreenshots(upstream, entry.subpath) || !hasUsableUpstream);
		}
		/**
		* Returns the URLs that should actually be rendered. Market captures are
		* intentionally kept separate from the source-of-truth repository screenshots.
		*/
		function getCatalogScreenshotUrls(entry) {
			const market = entry.marketScreenshots ?? [];
			const upstream = entry.screenshots;
			const contaminated = hasCrossPackageScreenshots(upstream, entry.subpath);
			const scopedUpstream = scopedScreenshots(upstream, entry.subpath);
			const usableUpstream = entry.review?.preview === "repository-card" ? [] : scopedUpstream.filter((url) => !isRepositoryPreviewUrl(url));
			if (contaminated) {
				const scopedDisplay = [.../* @__PURE__ */ new Set([...market, ...usableUpstream])];
				if (scopedDisplay.length > 0) return scopedDisplay;
			}
			if (usableUpstream.length > 0) return [...new Set(usableUpstream)];
			if (market.length > 0) return [...new Set(market)];
			return [.../* @__PURE__ */ new Set([...market, ...scopedUpstream])];
		}
		function getCatalogListScreenshot(entry) {
			return getCatalogScreenshotUrls(entry)[0] ?? entry.listScreenshot;
		}
		/** Keep entries with real UI imagery ahead of repository-only placeholders. */
		function hasCatalogPreview(entry) {
			const hasMarketScreenshots = (entry.marketScreenshots?.length ?? 0) > 0;
			const scopedUpstream = scopedScreenshots(entry.screenshots, entry.subpath);
			return entry.review?.preview !== "repository-card" && scopedUpstream.some((url) => !isRepositoryPreviewUrl(url)) || hasMarketScreenshots;
		}
		function compareCatalogOrder(a, b, sortBy, starsFor, updatedAtFor) {
			const aHasPreview = hasCatalogPreview(a);
			if (aHasPreview !== hasCatalogPreview(b)) return aHasPreview ? -1 : 1;
			return sortBy === "latest" ? Date.parse(updatedAtFor(b)) - Date.parse(updatedAtFor(a)) : starsFor(b) - starsFor(a);
		}
		//#endregion
		//#region src/media-preview.ts
		const DEFAULT_MEDIA_BASE_URL = "https://kingofsoysauce.github.io/dsh-skin-market/skin-media";
		const MEDIA_VERSION = "v1";
		function currentSearchParams() {
			const location = globalThis.location;
			return location === void 0 ? void 0 : new URLSearchParams(location.search ?? "");
		}
		let localGeneratedMediaSources;
		function setGeneratedMediaSources(sources) {
			localGeneratedMediaSources = sources === void 0 ? void 0 : new Set(sources);
		}
		function parseGeneratedMediaManifest(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			const entries = Object.entries(value);
			if (!entries.every(([source, digest]) => /^https?:\/\//i.test(source) && typeof digest === "string")) return void 0;
			return entries.map(([source]) => source);
		}
		function generatedMediaEnabled() {
			return currentSearchParams()?.get("dsh-media") !== "0";
		}
		function generatedMediaBase() {
			const explicit = currentSearchParams()?.get("dsh-media-base");
			return explicit === null ? void 0 : explicit;
		}
		function generatedMediaManifestUrl() {
			const base = generatedMediaBase();
			if (base === void 0) return `${DEFAULT_MEDIA_BASE_URL}/${MEDIA_VERSION}/manifest.json`;
			try {
				return new URL("manifest.json", base.endsWith("/") ? base : `${base}/`).toString();
			} catch {
				return `${DEFAULT_MEDIA_BASE_URL}/${MEDIA_VERSION}/manifest.json`;
			}
		}
		function previewSourceCandidates(source, fallbacks = []) {
			return [...new Set([source, ...fallbacks].filter((item) => typeof item === "string" && item !== ""))];
		}
		/**
		* An explicit base is available only for testing an alternate media host.
		*/
		function generatedMediaUrl(url) {
			const base = generatedMediaBase();
			if (base === void 0 || base === null) return url;
			try {
				const filename = new URL(url).pathname.split("/").pop();
				return filename === void 0 ? url : new URL(filename, base.endsWith("/") ? base : `${base}/`).toString();
			} catch {
				return url;
			}
		}
		function generatedMediaFor(entry, source, kind) {
			if (!generatedMediaEnabled() || source === void 0 || entry.media === void 0) return void 0;
			if (localGeneratedMediaSources !== void 0 && !localGeneratedMediaSources.has(source)) return void 0;
			if ((kind === "list" || kind === "avatar" || kind === "recommendation" || kind === "card") && source === getCatalogListScreenshot(entry)) return entry.media.list;
			const index = getCatalogScreenshotUrls(entry).indexOf(source);
			return index >= 0 ? entry.media.screenshots[index] ?? void 0 : void 0;
		}
		//#endregion
		//#region src/media-visibility.ts
		function mediaObserverConstructor() {
			return globalThis.IntersectionObserver;
		}
		function useLazyMedia(loading) {
			const ref = (0, react.useRef)(null);
			const [visible, setVisible] = (0, react.useState)(() => loading !== "lazy" || mediaObserverConstructor() === void 0);
			(0, react.useEffect)(() => {
				if (loading !== "lazy") {
					if (!visible) setVisible(true);
					return;
				}
				if (visible) return;
				const element = ref.current;
				const Observer = mediaObserverConstructor();
				if (element === null || Observer === void 0) {
					setVisible(true);
					return;
				}
				const observer = new Observer((entries) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						setVisible(true);
						observer.disconnect();
					}
				}, { rootMargin: "1200px 0px" });
				observer.observe(element);
				return () => observer.disconnect();
			}, [loading, visible]);
			return {
				ref,
				visible
			};
		}
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
		//#region src/install-command.ts
		/**
		* Format a DSH plugin install command for cmd.exe, PowerShell, and POSIX
		* shells. Single quotes are literal characters in cmd.exe, while double
		* quotes protect the `&path:` separator in the copied command.
		*/
		function quoteInstallTarget(target) {
			if (/[\u0000\r\n"]/.test(target)) throw new Error("install target contains unsupported command characters");
			return `"${target}"`;
		}
		function createDshPluginAddCommand(target, profile = "web") {
			return `dsh plugin --profile ${profile} add ${quoteInstallTarget(target)}`;
		}
		/** Copied `&path:` installs: POSIX and PowerShell profile dirs; `$DSH_HOME` is not a cmd/PowerShell variable. */
		function createInstallCommand(target, profile = "web") {
			if (!target.includes("&")) return createDshPluginAddCommand(target, profile);
			const quoted = quoteInstallTarget(target);
			return [`pnpm add ${quoted} --dir "$HOME/.dsh/profiles/${profile}"`, `pnpm add ${quoted} --dir "$env:USERPROFILE\\.dsh\\profiles\\${profile}"`].join("\n");
		}
		//#endregion
		//#region src/build-approval.ts
		/**
		* pnpm includes a monorepo package's subpath in the git build approval key.
		* Keep the catalog value and the key written to pnpm-workspace.yaml aligned.
		*/
		function effectiveBuildApprovalKey(skin) {
			const key = skin.install.allowBuild;
			if (key === void 0 || skin.subpath === void 0) return key;
			const pathMarker = "#path:";
			const markerIndex = key.indexOf(pathMarker);
			return `${markerIndex === -1 ? key : key.slice(0, markerIndex)}${pathMarker}${skin.subpath}`;
		}
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
1. 只用只读方式确认皮肤仓库是公开的 GitHub 仓库（或 monorepo 子目录），且确实是可安装的 DSH Web 皮肤。不要读取 .env、凭据或聊天记录。
2. fork/clone 目标目录仓库并新建分支。在 ${REGISTRY_PATH} 下只新增一个 YAML，文件名用 owner__repo.yml（子包用 owner__repo--path.yml）。不要覆盖已有条目，不要修改 data/catalog.json。
3. YAML 默认写成薄条目即可，CI 会从仓库读取 package、loader id、许可证、commit 和预览图。最小内容：

url: https://github.com/<owner>/<repo>
# subpath: packages/my-skin   # 仅 monorepo 子包需要
# description: 一句中文或英文描述  # 可选；缺省则用 package.json description

4. 预览图优先放在皮肤仓库自己的 screenshots.json（相对路径），或 README 里的仓库内图片。不要把 SVG、data URI、第三方图床写进市场 YAML。
5. 若你要自己写完整 schema，也可以；不要编造 commit SHA、rowId 或许可证。缺少关键信息时先列出缺项。
6. 在目标目录仓库根目录运行 npm run registry:check。不得安装到我的真实 DSH profile。
7. git diff --name-only 应只有 ${REGISTRY_PATH}/<条目文件>.yml。提交并向 ${REGISTRY_REPOSITORY} 创建 PR，标题 feat(registry): add <皮肤名>。
8. 返回 PR 链接；没有 GitHub 权限时只准备好分支和可复制的 PR 内容。

收录不等于安全认证。不要声称该皮肤已被 DSH 官方、安全团队或市场背书。`;
		}
		function createSkinInstallPrompt(skin) {
			const buildApprovalKey = effectiveBuildApprovalKey(skin);
			const buildApproval = buildApprovalKey === void 0 ? "" : `\n- 这个固定版本包含 prepare 构建脚本。只允许精确构件键 \`${buildApprovalKey}\`：在 profile 的 pnpm-workspace.yaml 里合并 \`allowBuilds:\n    '${buildApprovalKey}': true\`，不得开启 dangerouslyAllowAllBuilds。`;
			const companions = skin.install.companions ?? [];
			const companionLines = companions.length === 0 ? "" : `\n${companions.map((companion) => `- 伴生包：${companion.package}（rowId ${companion.rowId}）\n- 伴生安装目标：${companion.target}`).join("\n")}`;
			const command = createSkinInstallCommand(skin);
			const packages = [skin.package, ...companions.map((companion) => companion.package)].join("、");
			const rowIds = [skin.rowId ?? skin.package, ...companions.map((companion) => companion.rowId)].join("、");
			return `请把下面这个已固定版本的 DSH Web 皮肤安装到 web profile。必须先完成只读冲突检查，确认可以继续后再安装。\n\n- 仓库：${skin.repo}\n- 安装目标：${skin.install.target}\n- 安装命令：\n${command}\n- package：${skin.package}\n- loader rowId：${skin.rowId ?? skin.package}${companionLines}\n- 版本：${skin.install.version}\n- commit：${skin.install.commit}${buildApproval}\n\n严格按以下顺序执行：\n1. 不要改成 main、HEAD 或最新版本，必须使用上面的完整 commit。\n2. 安装前只读检查 web profile 的 package.json（dependencies 与 dsh.profile.bundles）、profile 的 cordis.patch.yml 和 $DSH_HOME/cordis.patch.yml（如有）。不要读取 .env、凭据或聊天记录。\n3. 从当前启用的 bundles 中识别其他皮肤、主题或外观插件：排除 @deepseek-ai/dsh-base、@deepseek-ai/dsh-web-app、dsh-skin-market 和本次目标 package ${skin.package}；读取候选 package.json 的名称、描述、dsh.client/dsh.bundle 声明，必要时再读 README。无法确定的候选先列出包名和描述。\n4. 如果发现其他已启用的皮肤插件，列出它们并停在安装前，提醒我先在“设置 → 皮肤市场”或 profile 的 cordis.patch.yml 中停用；未经我确认不得修改任何 profile 文件，也不得执行安装。\n5. 如果没有冲突，明确说“未检测到其他已启用的皮肤插件”，然后执行上面的全部固定安装命令（含伴生包）；不要替我安装、停用或卸载其他皮肤。\n6. 如果目标只有 dsh.client，幂等地确认 package ${packages} 和 rowId ${rowIds} 已注册到 web profile 的 cordis.patch.yml；不要放宽其他包的构建权限。\n7. 安装后验证 profile package.json 的 dependencies 和 dsh.profile.bundles、node_modules 中目标 package.json 的 dsh.client/dsh.bundle 声明，以及 loader rowId 注册项。任一缺失都要报告为安装或注册失败。\n8. 告诉我如何重启 DSH Web 使皮肤生效。`;
		}
		function createSkinInstallCommand(skin) {
			const targets = [skin.install.target, ...(skin.install.companions ?? []).map((companion) => companion.target)];
			return [...new Set(targets)].map((target) => createInstallCommand(target)).join("\n");
		}
		//#endregion
		//#region src/display-title.ts
		const DISPLAY_PREFIXES = [
			/^\s*DSKIN\s*[·•]\s*DeepSeek\s+Harness\s*[（(]\s*DSH\s*[）)]\s*/i,
			/^\s*DSH\s*[（(]\s*DeepSeek\s+Harness\s*[）)]\s*的\s*/i,
			/^\s*Third-party\s+DSH\s+WebUI\s+/i,
			/^\s*A\s+DSH\s+skin\s+plugin\s+that\s+/i,
			/^\s*DSH\s+皮肤插件\s*[:：]\s*/i,
			/^\s*DSH\s+Web(?:UI)?\s*[:：-]?\s*/i,
			/^\s*DeepSeek\s+Harness\s*[:：-]?\s*/i,
			/^\s*DS\s+Harness\s*[:：-]?\s*/i,
			/^\s*DSH\b\s*[:：-]?\s*/i
		];
		const LEADING_SEPARATORS = /^[\s:：\-–—|·•,，。.!！？]+/;
		/** Remove catalog boilerplate from the title shown to users without changing the source description. */
		function displayTitle(value) {
			const original = value.trim();
			let current = original;
			let changed = true;
			while (changed && current.length > 0) {
				changed = false;
				for (const pattern of DISPLAY_PREFIXES) {
					const next = current.replace(pattern, "");
					if (next !== current) {
						current = next.replace(LEADING_SEPARATORS, "").trim();
						changed = true;
						break;
					}
				}
			}
			return current || original;
		}
		function githubRepoLabel(repo) {
			return repo.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
		}
		//#endregion
		//#region src/semver.ts
		function parseVersion(value) {
			const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim());
			if (match === null) return null;
			return {
				core: [
					Number(match[1]),
					Number(match[2]),
					Number(match[3])
				],
				prerelease: match[4]?.split(".") ?? []
			};
		}
		function compareVersions(left, right) {
			const a = parseVersion(left);
			const b = parseVersion(right);
			if (a === null || b === null) return left.localeCompare(right);
			for (let index = 0; index < 3; index += 1) if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
			if (a.prerelease.length === 0 || b.prerelease.length === 0) return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length === 0 ? 1 : -1;
			const length = Math.max(a.prerelease.length, b.prerelease.length);
			for (let index = 0; index < length; index += 1) {
				const x = a.prerelease[index];
				const y = b.prerelease[index];
				if (x === void 0 || y === void 0) return x === y ? 0 : x === void 0 ? -1 : 1;
				if (x === y) continue;
				const xNumber = /^\d+$/.test(x);
				const yNumber = /^\d+$/.test(y);
				if (xNumber && yNumber) return Number(x) - Number(y);
				if (xNumber !== yNumber) return xNumber ? -1 : 1;
				return x.localeCompare(y);
			}
			return 0;
		}
		function comparator(value) {
			const match = /^(>=|<=|>|<|=|\^|~)?\s*(\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(value.trim());
			if (match === null) return null;
			const operator = match[1] ?? "=";
			const rawVersion = match[2];
			const core = rawVersion.split(/[+-]/, 1)[0].split(".").map(Number);
			if (core.length === 0 || core.length > 3 || core.some((value) => !Number.isInteger(value))) return null;
			if (core.length < 3 && ![
				">",
				">=",
				"<",
				"<=",
				"="
			].includes(operator)) return null;
			const version = core.length === 3 ? rawVersion : `${core.join(".")}${core.length === 1 ? ".0.0" : ".0"}-0`;
			if (parseVersion(version) === null) return null;
			return {
				operator,
				version
			};
		}
		function upperBound(version, operator) {
			const parsed = parseVersion(version);
			if (parsed === null) return null;
			const [major, minor, patch] = parsed.core;
			if (operator === "~") return `${major}.${minor + 1}.0-0`;
			if (major > 0) return `${major + 1}.0.0-0`;
			if (minor > 0) return `0.${minor + 1}.0-0`;
			return `0.0.${patch + 1}-0`;
		}
		function satisfiesComparator(version, value) {
			const parsed = comparator(value);
			if (parsed === null) return false;
			const difference = compareVersions(version, parsed.version);
			switch (parsed.operator) {
				case ">": return difference > 0;
				case ">=": return difference >= 0;
				case "<": return difference < 0;
				case "<=": return difference <= 0;
				case "^": return difference >= 0 && upperBound(parsed.version, "^") !== null && compareVersions(version, upperBound(parsed.version, "^")) < 0;
				case "~": return difference >= 0 && upperBound(parsed.version, "~") !== null && compareVersions(version, upperBound(parsed.version, "~")) < 0;
				default: return difference === 0;
			}
		}
		/**
		* Small, dependency-free range support for registry compatibility metadata.
		* It intentionally accepts the subset used by the catalog: exact versions,
		* comparator sets, caret/tilde ranges, and `||` alternatives.
		*/
		function satisfiesVersionRange(version, range) {
			if (parseVersion(version) === null) return false;
			const normalized = range.trim();
			if (normalized === "" || normalized === "*" || normalized === "x" || normalized === "X") return true;
			return normalized.split("||").some((alternative) => {
				const terms = alternative.trim().split(/\s+/).filter(Boolean);
				return terms.length > 0 && terms.every((term) => satisfiesComparator(version, term));
			});
		}
		//#endregion
		//#region src/compatibility.ts
		const KEYED_SLOT_CAPABILITY_PREFIX = "slot:keyed:";
		const DEFAULT_ADAPTER = {
			id: "builtin-keyed-settings-plugin-item",
			kind: "keyed-slot-id-to-key",
			when: ">=0.1.0-rc.6 <0.2.0-0",
			slot: "settings.plugin.item",
			key: "locale"
		};
		const BUILTIN_ADAPTER_BASE_VERSION = "0.1.0-rc.6";
		function declaredAdapters(skin) {
			return skin.compatibility.adapters ?? [];
		}
		function sameAdapter(left, right) {
			return left.kind === right.kind && left.when === right.when && left.slot === right.slot && left.key === right.key;
		}
		function applicableAdapters(skin, runtime, includeBuiltIns) {
			if (runtime.version === null) return [];
			const declared = declaredAdapters(skin);
			return (includeBuiltIns && skin.compatibility.dsh !== "unverified" && satisfiesVersionRange(BUILTIN_ADAPTER_BASE_VERSION, skin.compatibility.dsh) ? [...declared, DEFAULT_ADAPTER] : declared).filter((adapter, index, all) => all.findIndex((item) => sameAdapter(item, adapter)) === index).filter((adapter) => satisfiesVersionRange(runtime.version, adapter.when) && runtime.capabilities.includes(`${KEYED_SLOT_CAPABILITY_PREFIX}${adapter.slot}`));
		}
		function assessCompatibility(skin, runtime) {
			if (runtime.version === null) return {
				decision: "unknown",
				reason: "无法读取当前 DSH 版本，暂时拦截安装以避免破坏 profile",
				adapterIds: []
			};
			const declared = applicableAdapters(skin, runtime, false);
			if (skin.compatibility.dsh === "unverified") return {
				decision: "unknown",
				reason: `皮肤未声明 DSH 兼容范围（当前 ${runtime.version}）`,
				adapterIds: declared.map((adapter) => adapter.id)
			};
			if (declared.length > 0) return {
				decision: "adaptable",
				reason: `当前 DSH ${runtime.version} 命中可选兼容适配器`,
				adapterIds: declared.map((adapter) => adapter.id)
			};
			if (satisfiesVersionRange(runtime.version, skin.compatibility.dsh)) return {
				decision: "compatible",
				reason: `当前 DSH ${runtime.version} 在声明范围 ${skin.compatibility.dsh} 内`,
				adapterIds: []
			};
			const builtIns = applicableAdapters(skin, runtime, true);
			if (builtIns.length > 0) return {
				decision: "adaptable",
				reason: `当前 DSH ${runtime.version} 可通过通用兼容适配器安装`,
				adapterIds: builtIns.map((adapter) => adapter.id)
			};
			return {
				decision: "incompatible",
				reason: `当前 DSH ${runtime.version} 不在皮肤声明的兼容范围 ${skin.compatibility.dsh} 内，且没有可用适配器`,
				adapterIds: []
			};
		}
		//#endregion
		//#region src/catalog-search.ts
		function matchesCatalogSearch(entry, query) {
			const normalizedQuery = query.trim().toLowerCase();
			if (normalizedQuery === "") return true;
			return [
				entry.name.zh,
				entry.name.en,
				entry.description,
				entry.author,
				...entry.tags
			].join(" ").toLowerCase().includes(normalizedQuery);
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
			queued: "正在排队",
			resolving: "正在解析版本",
			downloading: "正在下载",
			installing: "正在写入插件",
			validating: "正在验证",
			activating: "正在切换",
			cancelling: "正在取消",
			cancelled: "已取消",
			done: "完成",
			failed: "操作失败"
		};
		function elapsedLabel(startedAt, now) {
			const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1e3));
			if (seconds < 60) return `${seconds} 秒`;
			return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
		}
		function byteLabel(bytes) {
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
			if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
			return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
		}
		function operationMeta(operation) {
			const details = [];
			if (operation.downloadedBytes !== void 0 && operation.totalBytes !== void 0) details.push(`${byteLabel(operation.downloadedBytes)} / ${byteLabel(operation.totalBytes)}`);
			else if (operation.downloadedBytes !== void 0) details.push(`已下载 ${byteLabel(operation.downloadedBytes)}`);
			if (operation.bytesPerSecond !== void 0 && operation.bytesPerSecond > 0) details.push(`${byteLabel(operation.bytesPerSecond)}/s`);
			return details;
		}
		function recoveryActionLabel(action) {
			if (action === "approve-build") return "批准构建并重试";
			if (action === "retry") return "重试";
		}
		const mutationLabels = {
			install: "安装中",
			activate: "使用中",
			deactivate: "停用中",
			pin: "设置常驻中",
			unpin: "取消常驻中",
			update: "更新中",
			uninstall: "卸载中"
		};
		const marketOperationTitles = {
			queued: "正在排队更新皮肤市场",
			checking: "正在检查皮肤市场更新",
			downloading: "正在下载皮肤市场",
			installing: "正在写入皮肤市场",
			cancelling: "正在取消皮肤市场更新",
			cancelled: "皮肤市场更新已取消",
			done: "皮肤市场更新完成",
			failed: "皮肤市场更新失败"
		};
		function OperationBanner({ title, startedAt, metadata, message, cancelable = false, terminal = false, failed = false, operationId, copyingLog = false, copiedLog = false, className, onCancel, onCopyLog, onDismiss, action }) {
			const [now, setNow] = (0, react.useState)(Date.now());
			(0, react.useEffect)(() => {
				if (terminal) return;
				const timer = window.setInterval(() => setNow(Date.now()), 1e3);
				return () => window.clearInterval(timer);
			}, [startedAt, terminal]);
			const details = [...new Set([...metadata, ...!terminal || failed ? [`已用时 ${elapsedLabel(startedAt, now)}`] : []].filter((item) => item !== ""))];
			const normalize = (value) => value.replace(/\s+/g, "");
			const normalizedMessage = message === void 0 ? "" : normalize(message);
			const messageText = message !== void 0 && message !== title && normalizedMessage !== "" && ![title, ...details].some((item) => {
				const normalizedItem = normalize(item);
				return normalizedItem === normalizedMessage || normalizedItem.includes(normalizedMessage) || normalizedMessage.includes(normalizedItem);
			}) ? message : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${SkinMarket_module_css_default.operation}${className === void 0 ? "" : ` ${className}`}`,
				role: "status",
				"aria-live": "polite",
				"data-terminal": terminal ? "true" : void 0,
				"data-failed": failed ? "true" : void 0,
				children: [
					terminal ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 16 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, { size: 16 }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: title }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SkinMarket_module_css_default.operationMeta,
						children: details.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["· ", item] }, item))
					}),
					messageText !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: SkinMarket_module_css_default.operationMessage,
						title: messageText,
						children: ["· ", messageText]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: SkinMarket_module_css_default.operationActions,
						children: [
							cancelable && onCancel !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								className: SkinMarket_module_css_default.operationCancel,
								variant: "outline",
								size: "sm",
								onClick: onCancel,
								children: "取消"
							}),
							failed && onCopyLog !== void 0 && operationId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								className: SkinMarket_module_css_default.operationCopyLog,
								variant: "outline",
								size: "sm",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {}),
								disabled: copyingLog,
								onClick: onCopyLog,
								children: copiedLog ? "日志已复制" : copyingLog ? "复制中…" : "复制日志"
							}),
							action,
							onDismiss !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								className: SkinMarket_module_css_default.operationDismiss,
								variant: "ghost",
								size: "sm",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(e, { size: 14 }),
								"aria-label": "关闭提示",
								title: "关闭提示",
								onClick: onDismiss
							})
						]
					})
				]
			});
		}
		const RELOAD_PARAM = "dsh-skin-reload";
		const ACTIVATION_WARNING_KEY = "dsh-skin-market:activation-warning-accepted";
		const RESET_HELP_URL = `${REGISTRY_REPOSITORY}#页面异常时重置皮肤`;
		function ResetHelpLink() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
				href: RESET_HELP_URL,
				target: "_blank",
				rel: "noreferrer",
				children: "页面异常时重置皮肤"
			});
		}
		function CompatibilityWarningNote({ assessment }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: SkinMarket_module_css_default.notice,
				role: "note",
				children: [
					assessment.reason,
					"。仍可继续使用；若页面异常，请查看 ",
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetHelpLink, {}),
					"。"
				]
			});
		}
		const GALLERY_INTERVAL_MS = 5600;
		const HOME_COMPACT_ENTER_SCROLL = 72;
		const HOME_COMPACT_EXIT_SCROLL = 16;
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
				primary: false,
				pinned: false,
				installedVersion: null,
				installedAt: null,
				lastOperatedAt: null,
				updateAvailable: false
			};
		}
		function statusLabel(state) {
			if (state.installation === "broken") return "安装异常";
			if (state.pinned && state.activation === "active") return "常驻";
			if (state.activation === "active") return "正在使用";
			if (state.activation === "restart-required") return "需要重启";
			if (state.installation === "installed") return "已安装";
			return "未安装";
		}
		function compactStatusLabel(state) {
			if (state.pinned && state.activation === "active") return "常驻";
			if (state.activation === "active") return "使用中";
			if (state.activation === "restart-required") return "待重启";
			if (state.installation === "broken") return "安装异常";
			if (state.installation === "installed") return "已安装";
			return "未安装";
		}
		function StatusLabel({ active = false, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: SkinMarket_module_css_default.statusLabel,
				"data-active": active ? "true" : void 0,
				children
			});
		}
		function installCompatibility(skin, hostKind, runtime) {
			if (hostKind !== "dsh") return null;
			if (runtime === null) return {
				decision: "unknown",
				reason: "无法读取当前 DSH 版本，安装结果需自行确认",
				adapterIds: []
			};
			return assessCompatibility(skin, runtime);
		}
		function advisoryCompatibility(skin, hostKind, runtime) {
			const assessment = installCompatibility(skin, hostKind, runtime);
			return assessment?.decision === "incompatible" || assessment?.decision === "unknown" ? assessment : null;
		}
		function displayDate(value) {
			const date = new Date(value);
			return Number.isNaN(date.getTime()) ? "未知" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
		}
		function compareSkinOrder(a, b, sortBy) {
			return compareCatalogOrder(a, b, sortBy, (skin) => skin.githubStars, (skin) => skin.releaseUpdatedAt);
		}
		function compareInstalledSkinOrder(a, b, states) {
			const aState = runtimeFor(states, a.id);
			const bState = runtimeFor(states, b.id);
			const priority = (state) => state.primary === true ? 0 : state.pinned === true ? 1 : 2;
			const priorityDifference = priority(aState) - priority(bState);
			if (priorityDifference !== 0) return priorityDifference;
			const aTime = Date.parse(aState.lastOperatedAt ?? aState.installedAt ?? "");
			const bTime = Date.parse(bState.lastOperatedAt ?? bState.installedAt ?? "");
			return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0) || a.name.zh.localeCompare(b.name.zh, "zh-CN") || a.id.localeCompare(b.id);
		}
		function PreviewMedia({ skin, src, fallbackSources, alt, kind, loading }) {
			const candidates = previewSourceCandidates(src, fallbackSources);
			const candidateKey = candidates.join("");
			const [sourceIndex, setSourceIndex] = (0, react.useState)(0);
			const [failed, setFailed] = (0, react.useState)(false);
			const [previewFailed, setPreviewFailed] = (0, react.useState)(false);
			const [fullFailed, setFullFailed] = (0, react.useState)(false);
			const lazyMedia = useLazyMedia(loading);
			(0, react.useEffect)(() => {
				setSourceIndex(0);
				setFailed(false);
				setPreviewFailed(false);
				setFullFailed(false);
			}, [candidateKey]);
			const activeIndex = Math.min(sourceIndex, Math.max(0, candidates.length - 1));
			const activeSrc = candidates[activeIndex];
			const tryNextSource = () => {
				if (fallbackSources !== void 0 && activeIndex + 1 < candidates.length) {
					setSourceIndex(activeIndex + 1);
					setPreviewFailed(false);
					setFullFailed(false);
				} else setFailed(true);
			};
			if (!hasCatalogPreview(skin) || activeSrc === void 0 || failed) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
			if (!lazyMedia.visible) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				ref: lazyMedia.ref,
				className: SkinMarket_module_css_default.mediaLazyPlaceholder,
				role: "img",
				"aria-label": alt
			});
			const media = generatedMediaFor(skin, activeSrc, kind);
			if (media === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
				src: activeSrc,
				alt,
				loading,
				decoding: "async",
				onLoad: (event) => {
					event.currentTarget.dataset.loaded = "true";
				},
				onError: tryNextSource
			});
			if (kind === "hero") {
				if (fullFailed) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src: activeSrc,
					alt,
					loading,
					decoding: "async",
					onError: tryNextSource
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src: generatedMediaUrl(media.full),
					alt,
					loading: loading === "lazy" ? "lazy" : "eager",
					decoding: "async",
					onError: () => setFullFailed(true)
				});
			}
			const imageSource = previewFailed ? activeSrc : generatedMediaUrl(media.preview);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
				src: imageSource,
				alt,
				loading,
				decoding: "async",
				onLoad: (event) => {
					event.currentTarget.dataset.loaded = "true";
				},
				onError: () => {
					if (previewFailed) tryNextSource();
					else setPreviewFailed(true);
				}
			});
		}
		function GalleryPreloads({ skin, screenshots }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: screenshots.map((source, index) => {
				const media = generatedMediaFor(skin, source, "hero");
				return media === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("link", {
					rel: "preload",
					as: "image",
					href: generatedMediaUrl(media.full)
				}, `${source}:${index}`);
			}) });
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
			const [hostKind, setHostKind] = (0, react.useState)("dsh");
			const [runtime, setRuntime] = (0, react.useState)(null);
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
			const [galleryPaused, setGalleryPaused] = (0, react.useState)(false);
			const [carouselEpoch, setCarouselEpoch] = (0, react.useState)(0);
			const [lightboxOpen, setLightboxOpen] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(null);
			const [mutation, setMutation] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [confirmUninstall, setConfirmUninstall] = (0, react.useState)(false);
			const [confirmPin, setConfirmPin] = (0, react.useState)(false);
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
			const [marketOperation, setMarketOperation] = (0, react.useState)(null);
			const [copyingLogId, setCopyingLogId] = (0, react.useState)(null);
			const [copiedLogId, setCopiedLogId] = (0, react.useState)(null);
			const [dismissedBuildApprovalId, setDismissedBuildApprovalId] = (0, react.useState)(null);
			const [marketUpdating, setMarketUpdating] = (0, react.useState)(false);
			const [restartTarget, setRestartTarget] = (0, react.useState)(null);
			const [pendingRestart, setPendingRestart] = (0, react.useState)(null);
			const [compatibilityNotice, setCompatibilityNotice] = (0, react.useState)(null);
			const [compatibilityWarning, setCompatibilityWarning] = (0, react.useState)(null);
			const [homeCompact, setHomeCompact] = (0, react.useState)(false);
			const skinListRef = (0, react.useRef)(null);
			const homeRef = (0, react.useRef)(null);
			const thumbnailStripRef = (0, react.useRef)(null);
			const detailRef = (0, react.useRef)(null);
			const pendingScrollAnchor = (0, react.useRef)(null);
			const thumbnailScrollRequest = (0, react.useRef)(false);
			const marketUpdatePolls = (0, react.useRef)(/* @__PURE__ */ new Set());
			const dismissedMarketOperationIds = (0, react.useRef)(/* @__PURE__ */ new Set());
			const pendingInstallActivation = (0, react.useRef)(null);
			const skinsRef = (0, react.useRef)([]);
			const selectedIdRef = (0, react.useRef)("");
			const userSelectedRef = (0, react.useRef)(false);
			const buildApprovalOperation = busy !== null && busy.phase === "failed" && busy.failure?.action === "approve-build" && busy.id !== dismissedBuildApprovalId ? busy : null;
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
					const active = runtimeStates.find((item) => item.primary) ?? runtimeStates.find((item) => item.activation === "active");
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
					setHostKind(state.hostKind ?? "dsh");
					setRuntime(state.runtime ?? null);
					setBusy((current) => current?.phase === "failed" && state.operation == null ? current : state.operation ?? null);
					if ("marketUpdateOperation" in state) {
						const operation = state.marketUpdateOperation !== null && state.marketUpdateOperation !== void 0 && !dismissedMarketOperationIds.current.has(state.marketUpdateOperation.id) ? state.marketUpdateOperation : null;
						setMarketOperation((current) => current?.phase === "failed" && operation === null ? current : operation);
						setMarketUpdating(operation?.phase !== void 0 && ![
							"done",
							"failed",
							"cancelled"
						].includes(operation.phase));
					}
					setInstalledClientPlugins(state.installedClientPlugins ?? []);
					setRunningAgents(typeof state.runningAgentCount === "number" && Number.isInteger(state.runningAgentCount) ? state.runningAgentCount : null);
					if (state.marketUpdateRestartRequired === true) {
						setRestartTarget({ kind: "market-update" });
						setRestartCheckFinished(true);
						setCompatibilityWarning(null);
						setConfirmRestart(true);
					}
				} finally {
					if (showLoading) {
						setLoading(false);
						setCatalogLoading(false);
					}
				}
			}, [acceptCatalog, catalogCache]);
			const openRestartConfirm = (0, react.useCallback)(async (skinId, kind = "skin", advisory = null) => {
				setError(null);
				setRunningAgents(null);
				setRestartCheckFinished(false);
				setRestartTarget(kind === "market-update" ? { kind } : {
					kind,
					skinId: skinId ?? selectedIdRef.current
				});
				setCompatibilityWarning(advisory);
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
			const waitForMarketUpdate = (0, react.useCallback)(async (operationId) => {
				if (marketUpdatePolls.current.has(operationId)) return;
				marketUpdatePolls.current.add(operationId);
				try {
					for (;;) {
						const operation = await json(`/dsh-skin-market/market-update/operations/${operationId}`);
						setMarketOperation(operation);
						if (operation.phase === "done") {
							setMarketUpdating(false);
							if (operation.status !== void 0) setMarketUpdate(operation.status);
							setMarketOperation(null);
							setPendingRestart({
								target: { kind: "market-update" },
								title: "皮肤市场已更新，待重启生效",
								startedAt: operation.finishedAt ?? (/* @__PURE__ */ new Date()).toISOString()
							});
							await openRestartConfirm(void 0, "market-update");
							return;
						}
						if (operation.phase === "failed" || operation.phase === "cancelled") {
							setMarketUpdating(false);
							setError(null);
							return;
						}
						await new Promise((resolve) => setTimeout(resolve, 600));
					}
				} catch (reason) {
					setMarketUpdating(false);
					const message = reason instanceof Error ? reason.message : String(reason);
					setMarketOperation((current) => current === null ? {
						id: `market-update-failed-${Date.now()}`,
						phase: "failed",
						message,
						startedAt: (/* @__PURE__ */ new Date()).toISOString()
					} : {
						...current,
						phase: "failed",
						cancelable: false,
						message
					});
					setError(null);
				} finally {
					marketUpdatePolls.current.delete(operationId);
				}
			}, [openRestartConfirm]);
			const checkMarketUpdate = (0, react.useCallback)(async () => {
				try {
					const status = await json("/dsh-skin-market/market-update");
					if (typeof status.updateAvailable === "boolean" && typeof status.currentVersion === "string" && typeof status.latestVersion === "string") setMarketUpdate(status);
					if (status.operation !== void 0) {
						const operation = status.operation !== null && !dismissedMarketOperationIds.current.has(status.operation.id) ? status.operation : null;
						setMarketOperation((current) => current?.phase === "failed" && operation === null ? current : operation);
						setMarketUpdating(operation !== null && ![
							"done",
							"failed",
							"cancelled"
						].includes(operation.phase));
						if (operation !== null && ![
							"done",
							"failed",
							"cancelled"
						].includes(operation.phase)) waitForMarketUpdate(operation.id);
					}
				} catch {}
			}, [waitForMarketUpdate]);
			const updateMarket = (0, react.useCallback)(async () => {
				setError(null);
				setMarketUpdating(true);
				try {
					const result = await json("/dsh-skin-market/market-update", { method: "POST" });
					if (typeof result.operationId === "string") {
						setMarketOperation({
							id: result.operationId,
							phase: "queued",
							cancelable: true,
							startedAt: (/* @__PURE__ */ new Date()).toISOString()
						});
						waitForMarketUpdate(result.operationId);
					} else if (typeof result.currentVersion === "string" && typeof result.latestVersion === "string" && typeof result.updateAvailable === "boolean") {
						setMarketUpdate(result);
						setMarketUpdating(false);
						setPendingRestart({
							target: { kind: "market-update" },
							title: "皮肤市场已更新，待重启生效",
							startedAt: (/* @__PURE__ */ new Date()).toISOString()
						});
						await openRestartConfirm(void 0, "market-update");
					} else throw new Error("皮肤市场服务未返回有效的更新任务");
				} catch (reason) {
					setMarketUpdating(false);
					const message = reason instanceof Error ? reason.message : String(reason);
					setMarketOperation((current) => current === null ? {
						id: `market-update-failed-${Date.now()}`,
						phase: "failed",
						message,
						startedAt: (/* @__PURE__ */ new Date()).toISOString()
					} : {
						...current,
						phase: "failed",
						cancelable: false,
						message
					});
					setError(null);
				}
			}, [openRestartConfirm, waitForMarketUpdate]);
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
				const controller = new AbortController();
				setGeneratedMediaSources([]);
				fetch(generatedMediaManifestUrl(), {
					cache: "no-store",
					signal: controller.signal
				}).then(async (response) => response.ok ? parseGeneratedMediaManifest(await response.json()) : void 0).then((sources) => setGeneratedMediaSources(sources)).catch(() => setGeneratedMediaSources(void 0));
				return () => controller.abort();
			}, []);
			(0, react.useEffect)(() => {
				checkMarketUpdate();
			}, [checkMarketUpdate]);
			(0, react.useEffect)(() => {
				if (marketOperation === null || [
					"done",
					"failed",
					"cancelled"
				].includes(marketOperation.phase)) return;
				waitForMarketUpdate(marketOperation.id);
			}, [
				marketOperation?.id,
				marketOperation?.phase,
				waitForMarketUpdate
			]);
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
			(0, react.useLayoutEffect)(() => {
				if (detailRef.current !== null) detailRef.current.scrollTop = 0;
			}, [selectedId]);
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
			const selected = skins.find((skin) => skin.id === selectedId) ?? skins[0];
			const selectedScreenshots = selected === void 0 ? [] : getCatalogScreenshotUrls(selected);
			const shotCount = selectedScreenshots.length;
			const state = selected === void 0 ? null : runtimeFor(states, selected.id);
			const compatibilityUnverified = selected?.review?.compatibility === "unverified";
			const isManualOnly = (skin) => hostKind === "desktop" ? skin.install.desktop?.mode !== "managed" : skin.review?.installation === "manual-only";
			const manualOnly = selected !== void 0 && isManualOnly(selected);
			const desktopManualReason = hostKind === "desktop" && selected?.install.desktop?.mode === "manual-only" ? selected.install.desktop.reason : void 0;
			const manualInstallNotice = hostKind === "desktop" ? desktopManualReason === void 0 ? "Desktop 当前仅支持已验证 npm 精确版本的一键安装；此皮肤请按仓库说明手动安装。" : `Desktop 暂不支持一键安装：${desktopManualReason}。请按仓库说明手动安装。` : "该皮肤暂不支持市场直接安装，请复制提示词交给 Agent 处理。";
			const manualHealthNotice = hostKind === "desktop" ? manualInstallNotice : "该仓库距离市场的一键安装规范还差少量信息；可参考右侧仓库健康建议完善，当前请按维护者说明安装。";
			const autoInstallable = !manualOnly;
			const filtered = (0, react.useMemo)(() => skins.filter((skin) => {
				if (!matchesCatalogSearch(skin, query)) return false;
				if (filter === "installed") return runtimeFor(states, skin.id).installation !== "missing";
				return true;
			}).sort((a, b) => filter === "installed" ? compareInstalledSkinOrder(a, b, states) : compareSkinOrder(a, b, sortBy)), [
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
			const installedSkins = (0, react.useMemo)(() => skins.filter((skin) => runtimeFor(states, skin.id).installation !== "missing").sort((a, b) => compareInstalledSkinOrder(a, b, states)), [skins, states]);
			const discoverySkins = (0, react.useMemo)(() => skins.filter((skin) => matchesCatalogSearch(skin, homeQuery)).sort((a, b) => compareSkinOrder(a, b, sortBy)), [
				homeQuery,
				skins,
				sortBy
			]);
			const visibleDiscoverySkins = (0, react.useMemo)(() => discoverySkins.slice(0, homeVisibleCount), [discoverySkins, homeVisibleCount]);
			const installedRowSkins = installedSkins.length > installedSlots ? installedSkins.slice(0, Math.max(1, installedSlots - 1)) : installedSkins;
			const installedOverflow = installedSkins.length > installedRowSkins.length;
			(0, react.useEffect)(() => {
				const isNarrow = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 959px)").matches;
				const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
				if (!browserOpen || !showDetail && isNarrow || galleryPaused || lightboxOpen || shotCount < 2 || reduceMotion) return;
				const timer = window.setTimeout(() => {
					thumbnailScrollRequest.current = true;
					setShotIndex((current) => (current + 1) % shotCount);
				}, GALLERY_INTERVAL_MS);
				return () => window.clearTimeout(timer);
			}, [
				browserOpen,
				carouselEpoch,
				galleryPaused,
				lightboxOpen,
				selected?.id,
				shotCount,
				shotIndex,
				showDetail
			]);
			(0, react.useEffect)(() => {
				if (!thumbnailScrollRequest.current) return;
				thumbnailScrollRequest.current = false;
				(thumbnailStripRef.current?.querySelector("[data-selected=\"true\"]"))?.scrollIntoView?.({
					behavior: "smooth",
					block: "nearest",
					inline: "nearest"
				});
			}, [selected?.id, shotIndex]);
			(0, react.useEffect)(() => {
				thumbnailScrollRequest.current = false;
				if (!browserOpen) return;
				const thumbnailStrip = thumbnailStripRef.current;
				if (thumbnailStrip !== null) thumbnailStrip.scrollLeft = 0;
			}, [browserOpen, selected?.id]);
			(0, react.useEffect)(() => {
				setGalleryPaused(false);
				setLightboxOpen(false);
				setCarouselEpoch((current) => current + 1);
			}, [selected?.id]);
			(0, react.useEffect)(() => {
				if (!lightboxOpen) return;
				const handleLightboxKeys = (event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						event.stopImmediatePropagation();
						setLightboxOpen(false);
						return;
					}
					if (shotCount < 2) return;
					if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
						thumbnailScrollRequest.current = true;
						setShotIndex((current) => event.key === "ArrowLeft" ? (current - 1 + shotCount) % shotCount : (current + 1) % shotCount);
					}
				};
				window.addEventListener("keydown", handleLightboxKeys, true);
				return () => window.removeEventListener("keydown", handleLightboxKeys, true);
			}, [lightboxOpen, shotCount]);
			const setCarouselPausedState = (paused) => {
				setGalleryPaused(paused);
				setCarouselEpoch((current) => current + 1);
			};
			const moveShot = (direction) => {
				if (shotCount > 1) {
					thumbnailScrollRequest.current = true;
					setShotIndex((current) => (current + direction + shotCount) % shotCount);
				}
			};
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
			const copyOperationLog = (0, react.useCallback)(async (operationId) => {
				setCopyingLogId(operationId);
				setError(null);
				try {
					const response = await fetch(`/dsh-skin-market/logs?operationId=${encodeURIComponent(operationId)}`, { cache: "no-store" });
					if (!response.ok) throw new Error(`日志导出失败（HTTP ${response.status}）`);
					const text = await response.text();
					if (!navigator.clipboard?.writeText) throw new Error("当前页面没有可用的剪贴板权限");
					await navigator.clipboard.writeText(text);
					setCopiedLogId(operationId);
					window.setTimeout(() => setCopiedLogId((current) => current === operationId ? null : current), 2400);
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setCopyingLogId((current) => current === operationId ? null : current);
				}
			}, []);
			const cancelOperation = (0, react.useCallback)(async () => {
				if (busy === null || busy.id === "pending" || busy.cancelable !== true) return;
				const operationId = busy.id;
				setError(null);
				setBusy((current) => current?.id === operationId ? {
					...current,
					phase: "cancelling",
					cancelable: false
				} : current);
				try {
					await json(`/dsh-skin-market/operations/${operationId}/cancel`, { method: "POST" });
				} catch (reason) {
					await refresh().catch(() => void 0);
					const message = reason instanceof Error ? reason.message : String(reason);
					setBusy((current) => current?.id === operationId ? {
						...current,
						phase: "failed",
						cancelable: false,
						message
					} : {
						...busy,
						phase: "failed",
						cancelable: false,
						message
					});
					setError(null);
				}
			}, [busy, refresh]);
			const cancelMarketUpdate = (0, react.useCallback)(async () => {
				const operation = marketOperation;
				if (operation === null || operation.cancelable !== true) return;
				setMarketOperation((current) => current?.id === operation.id ? {
					...current,
					phase: "cancelling",
					cancelable: false,
					message: "正在取消皮肤市场更新"
				} : current);
				try {
					const cancelled = await json(`/dsh-skin-market/market-update/operations/${operation.id}/cancel`, { method: "POST" });
					setMarketOperation(cancelled);
				} catch (reason) {
					const message = reason instanceof Error ? reason.message : String(reason);
					setMarketOperation((current) => current?.id === operation.id ? {
						...current,
						phase: "failed",
						cancelable: false,
						message
					} : current);
					setError(null);
				}
			}, [marketOperation]);
			const retryMarketUpdate = (0, react.useCallback)(async () => {
				const operation = marketOperation;
				if (operation === null || operation.failure?.action !== "retry") return;
				setMarketUpdating(true);
				try {
					const result = await json(`/dsh-skin-market/market-update/operations/${operation.id}/retry`, { method: "POST" });
					setMarketOperation({
						id: result.operationId,
						phase: "queued",
						cancelable: true,
						startedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					waitForMarketUpdate(result.operationId);
				} catch (reason) {
					setMarketUpdating(false);
					const message = reason instanceof Error ? reason.message : String(reason);
					setMarketOperation((current) => current?.id === operation.id ? {
						...current,
						phase: "failed",
						cancelable: false,
						message
					} : current);
					setError(null);
				}
			}, [marketOperation, waitForMarketUpdate]);
			const runForSkin = (0, react.useCallback)(async (skinId, kind, existingOperationId) => {
				const target = skins.find((skin) => skin.id === skinId);
				if (target === void 0) return false;
				const targetState = runtimeFor(states, target.id);
				setError(null);
				setMutation({
					skinId: target.id,
					kind
				});
				if (existingOperationId === void 0) setBusy({
					id: "pending",
					kind,
					skinId: target.id,
					phase: "queued",
					startedAt: (/* @__PURE__ */ new Date()).toISOString()
				});
				try {
					const operationId = existingOperationId ?? (await json(`/dsh-skin-market/${kind}`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ skinId: target.id })
					})).operationId;
					for (;;) {
						const operation = await json(`/dsh-skin-market/operations/${operationId}`);
						setBusy(operation);
						if (operation.phase === "done") {
							setBusy(null);
							let needsRestart = kind === "update" && (targetState.activation === "active" || targetState.activation === "restart-required");
							if (kind === "deactivate" || kind === "uninstall") await clientRuntime?.setActive(target.package, false);
							else if (kind === "unpin" && targetState.primary !== true) await clientRuntime?.setActive(target.package, false);
							else if (kind === "pin" && clientRuntime !== void 0) {
								needsRestart = !await clientRuntime.setActive(target.package, true);
								restoreMarketStyleOrder();
							} else if (kind === "activate" && clientRuntime !== void 0) {
								const pinnedPackages = states.filter((item) => item.pinned).map((item) => skins.find((skin) => skin.id === item.skinId)?.package).filter((packageName) => packageName !== void 0);
								needsRestart = !await switchClientSkin(clientRuntime, skins.map((skin) => skin.package), target.package, pinnedPackages);
								restoreMarketStyleOrder();
							}
							const advisory = kind === "activate" ? advisoryCompatibility(target, hostKind, runtime) : null;
							await refresh();
							if (needsRestart) {
								setStates((value) => value.map((item) => item.skinId === target.id ? {
									...item,
									activation: "restart-required"
								} : item));
								setPendingRestart({
									target: {
										kind: "skin",
										skinId: target.id
									},
									title: `${target.name.zh} ${kind === "update" ? "已更新" : "已完成操作"}，待重启生效`,
									startedAt: (/* @__PURE__ */ new Date()).toISOString()
								});
								await openRestartConfirm(target.id, "skin", advisory);
							} else if (advisory !== null) setCompatibilityWarning(advisory);
							return true;
						}
						if (operation.phase === "cancelled") {
							setBusy(null);
							await refresh();
							return false;
						}
						if (operation.phase === "failed") {
							if (operation.failure?.kind === "compatibility") {
								setBusy(null);
								setCompatibilityNotice({
									skin: target,
									assessment: {
										decision: "incompatible",
										reason: operation.failure.message,
										adapterIds: []
									}
								});
								await refresh().catch(() => void 0);
								return false;
							}
							await refresh().catch(() => void 0);
							setBusy(operation);
							setError(null);
							return false;
						}
						await new Promise((resolve) => setTimeout(resolve, 600));
					}
				} catch (reason) {
					await refresh().catch(() => void 0);
					const message = reason instanceof Error ? reason.message : String(reason);
					setBusy((current) => current === null || current.id === "pending" ? {
						id: `skin-operation-failed-${Date.now()}`,
						kind,
						skinId: target.id,
						phase: "failed",
						startedAt: (/* @__PURE__ */ new Date()).toISOString(),
						message
					} : {
						...current,
						phase: "failed",
						cancelable: false,
						message
					});
					setError(null);
					return false;
				} finally {
					setMutation(null);
				}
			}, [
				clientRuntime,
				hostKind,
				openRestartConfirm,
				refresh,
				runtime,
				skins,
				states
			]);
			const activateSkin = (0, react.useCallback)((skinId) => {
				pendingInstallActivation.current = null;
				try {
					window.localStorage.setItem(ACTIVATION_WARNING_KEY, "true");
				} catch {}
				setActivationWarningAccepted(true);
				runForSkin(skinId, "activate");
			}, [runForSkin]);
			const retrySkinOperation = (0, react.useCallback)(async () => {
				const operation = busy;
				const action = operation?.failure?.action;
				if (operation === null || operation === void 0 || action === void 0) return;
				try {
					const result = await json(`/dsh-skin-market/operations/${operation.id}/retry`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ action })
					});
					if (await runForSkin(operation.skinId, operation.kind, result.operationId) && operation.kind === "install" && pendingInstallActivation.current === operation.skinId) activateSkin(operation.skinId);
				} catch (reason) {
					const message = reason instanceof Error ? reason.message : String(reason);
					setBusy((current) => current?.id === operation.id ? {
						...current,
						message
					} : current);
					setError(null);
				}
			}, [
				activateSkin,
				busy,
				runForSkin
			]);
			const approveBuildAndRetry = (0, react.useCallback)(() => {
				if (buildApprovalOperation === null) return;
				setDismissedBuildApprovalId(buildApprovalOperation.id);
				retrySkinOperation();
			}, [buildApprovalOperation, retrySkinOperation]);
			const run = (0, react.useCallback)(async (kind) => selected === void 0 ? false : runForSkin(selected.id, kind), [runForSkin, selected]);
			const activateSelected = (0, react.useCallback)(() => {
				if (selected === void 0) return;
				activateSkin(selected.id);
			}, [activateSkin, selected]);
			const installAndActivate = (0, react.useCallback)(async () => {
				if (selected === void 0) return;
				pendingInstallActivation.current = selected.id;
				if (await runForSkin(selected.id, "install")) activateSkin(selected.id);
			}, [
				activateSkin,
				runForSkin,
				selected
			]);
			const installAndActivateSkin = (0, react.useCallback)(async (skinId) => {
				pendingInstallActivation.current = skinId;
				if (await runForSkin(skinId, "install")) activateSkin(skinId);
			}, [activateSkin, runForSkin]);
			const restartNow = (0, react.useCallback)(async () => {
				const target = restartTarget ?? {
					kind: "skin",
					skinId: selectedIdRef.current
				};
				if (target.kind === "skin" && target.skinId === "") return;
				setRestarting(true);
				setError(null);
				try {
					const accepted = await json("/dsh-skin-market/restart", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(target.kind === "market-update" ? { reason: "market-update" } : { skinId: target.skinId })
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
					setCompatibilityWarning(null);
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setRestarting(false);
				}
			}, [restartTarget]);
			const chooseSkin = (id) => {
				userSelectedRef.current = true;
				selectedIdRef.current = id;
				setSelectedId(id);
				setShotIndex(0);
				setLightboxOpen(false);
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
				setLightboxOpen(false);
				setBrowserOpen(false);
				setShowDetail(false);
			};
			const openCardInstall = (skin) => {
				if (isManualOnly(skin)) {
					chooseSkin(skin.id);
					setInstallCopied(null);
					setShowInstallOptions(true);
					return;
				}
				installAndActivateSkin(skin.id);
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
			const renderHomeCard = (skin, location) => {
				const itemState = runtimeFor(states, skin.id);
				const cardMutation = mutation?.skinId === skin.id ? mutation : null;
				const needsInstall = itemState.installation === "missing" || itemState.installation === "broken";
				const actionCount = cardMutation !== null || needsInstall ? 1 : itemState.installation === "installed" ? Number(itemState.activation === "inactive" || itemState.activation === "active") + Number(itemState.updateAvailable && !isManualOnly(skin)) : 0;
				const stateText = itemState.installation === "broken" ? "安装异常" : itemState.activation === "active" ? compactStatusLabel(itemState) : itemState.activation === "restart-required" ? "待重启" : itemState.installation === "installed" ? "已安装" : null;
				const open = () => location === "installed" ? openInstalledBrowser(skin.id) : openBrowser(skin.id, "discover");
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
					className: SkinMarket_module_css_default.homeCard,
					"data-active": itemState.activation === "active" ? "true" : void 0,
					"data-actions": actionCount,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "ghost",
						className: `${SkinMarket_module_css_default.homeCardOpen} dsh-skin-media-hover`,
						"aria-current": itemState.activation === "active" ? "true" : void 0,
						"aria-label": location === "installed" ? `${skin.name.zh} 已安装卡片` : `${skin.name.zh} 界面预览`,
						onClick: open,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SkinMarket_module_css_default.homeCardMedia,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewMedia, {
								skin,
								src: getCatalogListScreenshot(skin),
								fallbackSources: getCatalogScreenshotUrls(skin),
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
								}), location === "discover" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SkinMarket_module_css_default.feedMeta,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StarIcon, {
											size: 12,
											"aria-hidden": "true"
										}),
										" ",
										skin.githubStars
									]
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SkinMarket_module_css_default.homeCardDescription,
								title: skin.description,
								children: displayTitle(skin.description)
							})]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SkinMarket_module_css_default.homeCardFooter,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SkinMarket_module_css_default.homeCardRepo,
								title: githubRepoLabel(skin.repo),
								children: githubRepoLabel(skin.repo)
							}),
							stateText !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusLabel, {
								active: itemState.activation === "active",
								children: stateText
							}),
							actionCount > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: SkinMarket_module_css_default.cardInlineActions,
								role: "group",
								"aria-label": `${skin.name.zh} 操作`,
								children: cardMutation !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SkinMarket_module_css_default.cardActionProgress,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {}), mutationLabels[cardMutation.kind]]
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									needsInstall && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										className: SkinMarket_module_css_default.cardAction,
										variant: "outline",
										size: "sm",
										disabled: mutation !== null,
										title: isManualOnly(skin) ? "复制安装提示词" : "安装并使用当前皮肤",
										onClick: () => openCardInstall(skin),
										children: isManualOnly(skin) ? "需手动安装" : "安装并使用"
									}),
									itemState.installation === "installed" && itemState.activation === "inactive" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										className: SkinMarket_module_css_default.cardAction,
										variant: "outline",
										size: "sm",
										disabled: mutation !== null,
										onClick: () => activateCard(skin.id),
										children: "使用"
									}),
									itemState.installation === "installed" && itemState.activation === "active" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										className: SkinMarket_module_css_default.cardAction,
										variant: "outline",
										size: "sm",
										disabled: mutation !== null,
										onClick: () => {
											runForSkin(skin.id, "deactivate");
										},
										children: "停用"
									}),
									itemState.installation === "installed" && itemState.updateAvailable && !isManualOnly(skin) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										className: SkinMarket_module_css_default.cardAction,
										variant: "outline",
										size: "sm",
										disabled: mutation !== null,
										onClick: () => {
											runForSkin(skin.id, "update");
										},
										children: "更新"
									})
								] })
							})
						]
					})]
				}, `${location}:${skin.id}`);
			};
			const renderSkinOperationBanner = (className) => busy === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OperationBanner, {
				operationId: busy.id,
				copyingLog: copyingLogId === busy.id,
				copiedLog: copiedLogId === busy.id,
				className,
				title: `${phases[busy.phase]}“${skins.find((skin) => skin.id === busy.skinId)?.name.zh ?? busy.skinId}”`,
				startedAt: busy.startedAt,
				metadata: operationMeta(busy),
				message: busy.message,
				terminal: busy.phase === "done" || busy.phase === "failed" || busy.phase === "cancelled",
				failed: busy.phase === "failed",
				cancelable: busy.cancelable === true,
				onCancel: () => {
					cancelOperation();
				},
				onCopyLog: () => {
					copyOperationLog(busy.id);
				},
				action: busy.failure?.action === "approve-build" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					size: "sm",
					onClick: () => setDismissedBuildApprovalId(null),
					children: "查看批准说明"
				}) : recoveryActionLabel(busy.failure?.action) === void 0 ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					size: "sm",
					onClick: () => {
						retrySkinOperation();
					},
					children: recoveryActionLabel(busy.failure?.action)
				}),
				onDismiss: busy.phase === "failed" || busy.phase === "cancelled" || busy.phase === "done" ? () => setBusy(null) : void 0
			});
			const renderMarketOperationBanner = (className) => marketOperation === null || marketOperation.phase === "done" && pendingRestart !== null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OperationBanner, {
				operationId: marketOperation.id,
				copyingLog: copyingLogId === marketOperation.id,
				copiedLog: copiedLogId === marketOperation.id,
				className,
				title: marketOperationTitles[marketOperation.phase],
				startedAt: marketOperation.startedAt,
				metadata: operationMeta(marketOperation),
				message: marketOperation.message,
				terminal: marketOperation.phase === "done" || marketOperation.phase === "failed" || marketOperation.phase === "cancelled",
				failed: marketOperation.phase === "failed",
				cancelable: marketOperation.cancelable === true,
				onCancel: () => {
					cancelMarketUpdate();
				},
				onCopyLog: () => {
					copyOperationLog(marketOperation.id);
				},
				action: recoveryActionLabel(marketOperation.failure?.action) === void 0 ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					size: "sm",
					onClick: () => {
						retryMarketUpdate();
					},
					children: recoveryActionLabel(marketOperation.failure?.action)
				}),
				onDismiss: marketOperation.phase === "failed" || marketOperation.phase === "cancelled" || marketOperation.phase === "done" ? () => {
					dismissedMarketOperationIds.current.add(marketOperation.id);
					setMarketOperation(null);
				} : void 0
			});
			const renderPendingRestartBanner = (className) => pendingRestart === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OperationBanner, {
				className,
				title: pendingRestart.title,
				startedAt: pendingRestart.startedAt,
				metadata: [],
				terminal: true,
				action: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					size: "sm",
					onClick: () => void openRestartConfirm(pendingRestart.target.kind === "skin" ? pendingRestart.target.skinId : void 0, pendingRestart.target.kind),
					children: "重启"
				}),
				onDismiss: () => setPendingRestart(null)
			});
			const marketUpdateActive = marketOperation !== null && ![
				"done",
				"failed",
				"cancelled"
			].includes(marketOperation.phase);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: SkinMarket_module_css_default.root,
				"data-dsh-skin-market": true,
				"data-detail": showDetail ? "open" : "closed",
				"data-browser-open": browserOpen ? "true" : "false",
				children: [
					browserOpen && selected !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GalleryPreloads, {
						skin: selected,
						screenshots: selectedScreenshots
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
						className: SkinMarket_module_css_default.home,
						hidden: browserOpen,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
							className: SkinMarket_module_css_default.homeHeader,
							"data-compact": homeCompact ? "true" : void 0,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: SkinMarket_module_css_default.homeTitleRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [skins.length, " 款社区皮肤"] })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: SkinMarket_module_css_default.homeActions,
										children: [
											marketUpdate?.updateAvailable === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												className: `${SkinMarket_module_css_default.marketUpdateButton} ${SkinMarket_module_css_default.homeUpdateAction}`,
												variant: "outline",
												size: "sm",
												icon: marketUpdating ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16, {}),
												"aria-label": `更新皮肤市场到 ${marketUpdate.latestVersion}`,
												title: `发现新版本 ${marketUpdate.latestVersion}`,
												disabled: marketUpdating || marketUpdateActive || busy !== null,
												"data-updating": marketUpdating || marketUpdateActive ? "true" : void 0,
												onClick: () => {
													updateMarket();
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: SkinMarket_module_css_default.marketUpdateLabel,
													children: marketUpdating ? "更新中" : "更新"
												})
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												className: SkinMarket_module_css_default.homeGithubAction,
												variant: "outline",
												size: "sm",
												icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarkGithubIcon, {
													size: 15,
													"aria-hidden": "true"
												}),
												"aria-label": "打开 GitHub 仓库",
												title: "打开 GitHub 仓库",
												onClick: () => window.open(REGISTRY_REPOSITORY, "_blank", "noopener,noreferrer"),
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: SkinMarket_module_css_default.homeGithubLabel,
													children: "GitHub"
												})
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												className: SkinMarket_module_css_default.homeSubmitAction,
												variant: "outline",
												size: "sm",
												icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(e$1, {
													size: 15,
													"aria-hidden": "true"
												}),
												onClick: () => {
													setShowSubmission(true);
													setSubmissionCopied(false);
												},
												children: "提交皮肤"
											})
										]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									className: SkinMarket_module_css_default.homeSearch,
									value: homeQuery,
									onChange: (event) => setHomeQuery(event.currentTarget.value),
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, {}),
									placeholder: t("search"),
									"aria-label": t("search")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: SkinMarket_module_css_default.homeSearchPlaceholder,
									"aria-hidden": "true"
								}),
								renderSkinOperationBanner(SkinMarket_module_css_default.homeOperation),
								renderMarketOperationBanner(SkinMarket_module_css_default.homeOperation),
								renderPendingRestartBanner(SkinMarket_module_css_default.homeOperation)
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SkinMarket_module_css_default.homeContent,
							ref: homeRef,
							onScroll: (event) => {
								const home = event.currentTarget;
								setHomeCompact((current) => current ? home.scrollTop > HOME_COMPACT_EXIT_SCROLL : home.scrollTop > HOME_COMPACT_ENTER_SCROLL);
								if (discoverySkins.length > homeVisibleCount && home.scrollHeight - home.scrollTop - home.clientHeight < 560) setHomeVisibleCount((value) => Math.min(discoverySkins.length, value + 20));
							},
							children: [homeQuery.trim() === "" && (loading || installedSkins.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: SkinMarket_module_css_default.homeSection,
								"aria-labelledby": "installed-skins-title",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: SkinMarket_module_css_default.homeSectionTitle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										id: "installed-skins-title",
										children: "已安装"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "正在使用、常驻优先，其余按最近操作排序" })]
								}), loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: SkinMarket_module_css_default.installedRow,
									style: { "--installed-columns": installedSlots },
									role: "status",
									"aria-label": "正在加载已安装皮肤",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SkinMarket_module_css_default.srOnly,
										children: "正在加载已安装皮肤…"
									}), Array.from({ length: installedSlots }, (_, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
										className: SkinMarket_module_css_default.installedSkeletonCard,
										"aria-hidden": "true",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {})] })]
									}, index))]
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: SkinMarket_module_css_default.installedRow,
									style: { "--installed-columns": installedSlots },
									children: [installedRowSkins.map((skin) => renderHomeCard(skin, "installed")), installedOverflow && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										className: `${SkinMarket_module_css_default.homeCard} ${SkinMarket_module_css_default.installedMoreCard}`,
										onClick: () => openInstalledBrowser(),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(r, {
											size: 24,
											"aria-hidden": "true"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "查看全部已安装" })]
									})]
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
										children: visibleDiscoverySkins.map((skin) => renderHomeCard(skin, "discover"))
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: browserOpen,
						onClose: closeBrowser,
						title: "皮肤详情",
						closeLabel: "关闭",
						className: SkinMarket_module_css_default.browserModal,
						contentClassName: SkinMarket_module_css_default.browserContent,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
							className: SkinMarket_module_css_default.browser,
							"data-detail": showDetail ? "open" : "closed",
							"aria-label": "皮肤详情",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: SkinMarket_module_css_default.browserPanel,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
									className: SkinMarket_module_css_default.catalog,
									"aria-label": t("catalog"),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: SkinMarket_module_css_default.catalogHeader,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											value: query,
											onChange: (event) => setQuery(event.currentTarget.value),
											icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, {}),
											placeholder: t("search"),
											"aria-label": t("search")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: SkinMarket_module_css_default.filterBar,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: SkinMarket_module_css_default.filters,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
													className: SkinMarket_module_css_default.filterPill,
													active: filter === "all",
													"aria-pressed": filter === "all",
													onClick: () => {
														setFilter("all");
														setSortBy("stars");
													},
													children: "全部"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
													className: SkinMarket_module_css_default.filterPill,
													active: filter === "installed",
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
										})]
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
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: `${SkinMarket_module_css_default.skinCardPreview} dsh-skin-media-hover`,
															children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewMedia, {
																skin,
																src: getCatalogListScreenshot(skin),
																fallbackSources: getCatalogScreenshotUrls(skin),
																alt: `${skin.name.zh} 界面预览`,
																kind: "list",
																loading: "lazy"
															}, `${skin.id}:${getCatalogListScreenshot(skin) ?? "missing"}:list`)
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
															className: SkinMarket_module_css_default.skinCardBody,
															children: [
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: SkinMarket_module_css_default.cardTitle,
																	children: skin.name.zh
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: SkinMarket_module_css_default.cardDescription,
																	title: skin.description,
																	children: displayTitle(skin.description)
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																	className: SkinMarket_module_css_default.cardMetaLine,
																	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		className: SkinMarket_module_css_default.cardMeta,
																		title: githubRepoLabel(skin.repo),
																		children: githubRepoLabel(skin.repo)
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
																})
															]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusLabel, {
															active: mutationLabel === null && itemState.activation === "active",
															children: mutationLabel ?? (itemState.activation === "active" ? compactStatusLabel(itemState) : itemState.updateAvailable && !isManualOnly(skin) ? "可更新" : compactStatusLabel(itemState))
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
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusLabel, { children: "市场外" })]
											}, plugin.package)),
											!loading && browserOpen && selected === void 0 && error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: SkinMarket_module_css_default.error,
												role: "alert",
												children: error
											})
										]
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("main", {
									className: SkinMarket_module_css_default.detail,
									ref: detailRef,
									"aria-label": "皮肤详情内容",
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
											className: SkinMarket_module_css_default.mobileBack,
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
													src: getCatalogListScreenshot(selected),
													alt: "",
													kind: "avatar"
												}, `${selected.id}:${getCatalogListScreenshot(selected) ?? "missing"}:avatar`)
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: SkinMarket_module_css_default.titleBlock,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: selected.name.zh }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														className: SkinMarket_module_css_default.description,
														title: selected.description,
														children: displayTitle(selected.description)
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														className: SkinMarket_module_css_default.author,
														children: githubRepoLabel(selected.repo)
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
															runtime?.version !== void 0 && runtime.version !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	"aria-hidden": "true",
																	children: " · "
																}),
																"当前 DSH ",
																runtime.version
															] }),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusLabel, {
																active: state.activation === "active",
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
														variant: "primary",
														size: "sm",
														icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16, {}),
														disabled: busy !== null,
														onClick: () => void installAndActivate(),
														children: "安装并使用"
													}),
													autoInstallable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														variant: "outline",
														size: "sm",
														disabled: busy !== null,
														onClick: () => void run("install"),
														children: "仅安装"
													}),
													autoInstallable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
													variant: "primary",
													size: "sm",
													disabled: busy !== null,
													onClick: activateSelected,
													children: "使用"
												}),
												state.installation === "installed" && state.activation === "inactive" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													className: SkinMarket_module_css_default.pinAction,
													variant: "outline",
													size: "sm",
													"aria-pressed": "false",
													title: "在不替换当前主皮肤的情况下启用并常驻，适合宠物、音效等可叠加插件；多个皮肤可能发生冲突",
													disabled: busy !== null,
													onClick: () => setConfirmPin(true),
													children: "常驻使用"
												}),
												state.activation === "restart-required" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													variant: "primary",
													size: "sm",
													disabled: busy !== null,
													onClick: () => void openRestartConfirm(),
													children: "重启以应用"
												}),
												state.activation === "active" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													variant: "outline",
													size: "sm",
													disabled: busy !== null,
													onClick: () => void run("deactivate"),
													children: "停用"
												}),
												state.activation === "active" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													className: SkinMarket_module_css_default.pinAction,
													variant: "outline",
													size: "sm",
													"aria-pressed": state.pinned === true,
													title: state.pinned ? "取消后，如果它不是当前主皮肤，将立即停用；以后切换皮肤时也不会再保留" : "切换其他皮肤时仍保持启用，适合宠物、音效等可叠加插件；多个皮肤可能发生冲突",
													disabled: busy !== null,
													onClick: () => state.pinned ? void run("unpin") : setConfirmPin(true),
													children: state.pinned ? "取消常驻" : "常驻使用"
												}),
												state.activation === "restart-required" && state.pinned && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													className: SkinMarket_module_css_default.pinAction,
													variant: "outline",
													size: "sm",
													"aria-pressed": "true",
													title: "取消常驻并撤销待重启的启用状态",
													disabled: busy !== null,
													onClick: () => void run("unpin"),
													children: "取消常驻"
												}),
												state.updateAvailable && !manualOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													variant: state.activation === "active" && !state.pinned ? "primary" : "outline",
													size: "sm",
													icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, {}),
													disabled: busy !== null,
													onClick: () => void run("update"),
													children: "更新"
												}),
												state.installation !== "missing" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													className: SkinMarket_module_css_default.iconOnlyButton,
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
										(selected.install.companions?.length ?? 0) > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: SkinMarket_module_css_default.notice,
											role: "note",
											children: "使用该皮肤时会加载细节定制面板；停用或换到其他皮肤后会从设置页撤掉，不会当成一张独立皮肤。"
										}),
										renderSkinOperationBanner(),
										renderMarketOperationBanner(),
										renderPendingRestartBanner(),
										error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: SkinMarket_module_css_default.error,
											role: "alert",
											children: error
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: SkinMarket_module_css_default.galleryGroup,
											"data-paused": galleryPaused ? "true" : "false",
											onMouseEnter: () => setCarouselPausedState(true),
											onMouseLeave: () => setCarouselPausedState(false),
											onFocusCapture: () => setCarouselPausedState(true),
											onBlurCapture: (event) => {
												if (!event.currentTarget.contains(event.relatedTarget)) setCarouselPausedState(false);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: SkinMarket_module_css_default.hero,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: `${SkinMarket_module_css_default.heroOpen} dsh-skin-media-hover`,
													"aria-label": `全屏查看 ${selected.name.zh} 截图 ${shotIndex + 1}`,
													onClick: () => setLightboxOpen(true),
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewMedia, {
														skin: selected,
														src: selectedScreenshots[shotIndex],
														alt: `${selected.name.zh} 大图预览`,
														kind: "hero"
													}, `${selected.id}:${selectedScreenshots[shotIndex] ?? "missing"}:hero`)
												}), shotCount > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													className: `${SkinMarket_module_css_default.heroNav} ${SkinMarket_module_css_default.heroPrev}`,
													variant: "ghost",
													icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { size: 18 }),
													"aria-label": "上一张截图",
													onClick: () => moveShot(-1)
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													className: `${SkinMarket_module_css_default.heroNav} ${SkinMarket_module_css_default.heroNext}`,
													variant: "ghost",
													icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { size: 18 }),
													"aria-label": "下一张截图",
													onClick: () => moveShot(1)
												})] })]
											}), selectedScreenshots.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: SkinMarket_module_css_default.thumbnails,
												ref: thumbnailStripRef,
												"aria-label": "截图选择",
												children: selectedScreenshots.map((shot, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: SkinMarket_module_css_default.thumbnailFrame,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														className: "dsh-skin-media-hover",
														variant: "ghost",
														"data-selected": index === shotIndex,
														onClick: () => {
															setShotIndex(index);
															setCarouselEpoch((current) => current + 1);
														},
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewMedia, {
															skin: selected,
															src: shot,
															alt: `${selected.name.zh} 截图 ${index + 1}`,
															kind: "thumbnail",
															loading: "lazy"
														})
													}), index === shotIndex && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: SkinMarket_module_css_default.thumbnailProgress,
														"aria-hidden": "true"
													}, `${selected.id}:${shotIndex}:${carouselEpoch}`)]
												}, shot))
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: SkinMarket_module_css_default.aboutGrid,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "关于此皮肤" }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: selected.description }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: SkinMarket_module_css_default.tags,
													children: selected.tags.map((tag) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, { children: tag }, tag))
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
													className: SkinMarket_module_css_default.metadata,
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "许可证" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: selected.license.code })] }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "代码商业使用" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: selected.license.commercialUse ? "许可证允许" : "未获授权" })] }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "模式" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: selected.modes.join(" / ") })] })
													]
												}),
												manualOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													className: SkinMarket_module_css_default.notice,
													children: manualHealthNotice
												}),
												selected.review?.preview === "repository-card" && !selected.marketScreenshots?.length && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													className: SkinMarket_module_css_default.notice,
													children: "该仓库暂无可识别的皮肤截图，市场使用本地占位卡，不会加载 GitHub 仓库图片。"
												}),
												usesMarketScreenshots(selected) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													className: SkinMarket_module_css_default.notice,
													children: "当前展示的是市场在隔离 DSH 中实机补录的截图；仓库尚无可识别的界面截图。"
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
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "更多推荐" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: recommendations.map((skin) => renderHomeCard(skin, "discover")) })]
										})
									] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: SkinMarket_module_css_default.loading,
										children: "暂无可展示的皮肤详情"
									})
								})]
							})
						})
					}),
					lightboxOpen && selected !== void 0 && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: SkinMarket_module_css_default.lightbox,
						role: "dialog",
						"aria-modal": "true",
						"aria-label": `${selected.name.zh} 全屏截图查看`,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								className: SkinMarket_module_css_default.lightboxClose,
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(e, { size: 20 }),
								"aria-label": "关闭全屏查看",
								onClick: () => setLightboxOpen(false)
							}),
							shotCount > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								className: `${SkinMarket_module_css_default.lightboxNav} ${SkinMarket_module_css_default.lightboxPrev}`,
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { size: 26 }),
								"aria-label": "上一张截图",
								onClick: () => moveShot(-1)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: SkinMarket_module_css_default.lightboxStage,
								"aria-label": "退出全屏查看",
								onClick: () => setLightboxOpen(false),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewMedia, {
									skin: selected,
									src: selectedScreenshots[shotIndex],
									alt: `${selected.name.zh} 全屏截图 ${shotIndex + 1}`,
									kind: "hero"
								}, `${selected.id}:${selectedScreenshots[shotIndex] ?? "missing"}:lightbox`)
							}),
							shotCount > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								className: `${SkinMarket_module_css_default.lightboxNav} ${SkinMarket_module_css_default.lightboxNext}`,
								variant: "ghost",
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { size: 26 }),
								"aria-label": "下一张截图",
								onClick: () => moveShot(1)
							}),
							shotCount > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: SkinMarket_module_css_default.lightboxThumbnails,
								"aria-label": "全屏截图选择",
								children: selectedScreenshots.map((shot, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									className: "dsh-skin-media-hover",
									variant: "ghost",
									"data-selected": index === shotIndex,
									"aria-label": `查看截图 ${index + 1}`,
									onClick: () => setShotIndex(index),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewMedia, {
										skin: selected,
										src: shot,
										alt: "",
										kind: "thumbnail",
										loading: "lazy"
									})
								}, shot))
							})
						]
					}), document.body),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: buildApprovalOperation !== null,
						onClose: () => setDismissedBuildApprovalId(buildApprovalOperation?.id ?? null),
						title: "需要批准构建脚本",
						closeLabel: "关闭",
						description: buildApprovalOperation?.failure?.message ?? "",
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							onClick: () => setDismissedBuildApprovalId(buildApprovalOperation?.id ?? null),
							children: "稍后"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "sm",
							onClick: approveBuildAndRetry,
							children: "批准并重试"
						})] }),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: SkinMarket_module_css_default.notice,
							children: "pnpm 默认阻止依赖执行安装构建脚本。确认后只批准这次报错中列出的精确构建项，不会开启全局构建脚本。"
						}), buildApprovalOperation?.failure?.packageName !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: SkinMarket_module_css_default.notice,
							children: ["涉及依赖：", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: buildApprovalOperation.failure.packageName })]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: confirmUninstall,
						onClose: () => setConfirmUninstall(false),
						title: "卸载皮肤",
						closeLabel: "关闭",
						description: state?.activation === "active" ? "当前皮肤会先停用并恢复 DSH 默认外观，然后删除安装包。" : "将从当前 DSH profile 删除这个皮肤安装包。",
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							onClick: () => setConfirmUninstall(false),
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
						open: confirmPin,
						onClose: () => setConfirmPin(false),
						title: "常驻使用此皮肤",
						closeLabel: "关闭",
						description: "开启后，切换其他皮肤时不会自动停用此皮肤。适合宠物、音效等可叠加插件；多个皮肤可能同时修改样式、页面结构或功能，相关冲突风险由用户自行承担。",
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							onClick: () => setConfirmPin(false),
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "sm",
							onClick: () => {
								setConfirmPin(false);
								run("pin");
							},
							children: "确认常驻"
						})] }),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: SkinMarket_module_css_default.pinWarning,
							children: [
								"如果发生冲突或页面无法操作，请停止 DSH，然后查看 ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetHelpLink, {}),
								" 中的修复命令。"
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: compatibilityNotice !== null,
						onClose: () => setCompatibilityNotice(null),
						title: "已拦截安装",
						closeLabel: "关闭",
						description: compatibilityNotice === null ? "" : `${compatibilityNotice.skin.name.zh}：${compatibilityNotice.assessment.reason}`,
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "sm",
							onClick: () => setCompatibilityNotice(null),
							children: "知道了"
						}),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: SkinMarket_module_css_default.notice,
							children: [
								"仍可稍后重试安装。若页面异常，请查看 ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetHelpLink, {}),
								"。"
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: showInstallOptions,
						onClose: () => setShowInstallOptions(false),
						title: `安装 ${selected?.name.zh ?? "皮肤"}`,
						closeLabel: "关闭",
						description: manualOnly ? "需要按仓库说明完成安装。" : "任选一种，不用都执行。",
						footer: manualOnly ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							onClick: () => setShowInstallOptions(false),
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "sm",
							onClick: () => void copyInstallOption("prompt"),
							children: installCopied === `${selected?.id}:prompt` ? "提示词已复制" : "复制提示词"
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							onClick: () => setShowInstallOptions(false),
							children: "关闭"
						}),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SkinMarket_module_css_default.installOptions,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "提示词" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SkinMarket_module_css_default.copyCapsule,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
										title: selected === void 0 ? "" : createSkinInstallPrompt(selected),
										children: selected === void 0 ? "" : createSkinInstallPrompt(selected)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										className: SkinMarket_module_css_default.copyCapsuleButton,
										variant: "outline",
										size: "sm",
										icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {}),
										"aria-label": installCopied === `${selected?.id}:prompt` ? "提示词已复制" : "复制提示词",
										title: "复制提示词",
										onClick: () => void copyInstallOption("prompt")
									})]
								})] }),
								manualOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: SkinMarket_module_css_default.manualInstallGuide,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "按仓库说明完成安装" }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "市场不提供这款皮肤的一键安装命令。复制提示词，让 Agent 先检查仓库，再按维护者说明完成安装。" }),
										selected !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
											href: selected.repo,
											target: "_blank",
											rel: "noreferrer",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarkGithubIcon, {
												size: 15,
												"aria-hidden": "true"
											}), "打开 GitHub 仓库"]
										})
									]
								}),
								!manualOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "命令" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: SkinMarket_module_css_default.copyCapsule,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
											title: selected === void 0 ? "" : createSkinInstallCommand(selected),
											children: selected === void 0 ? "" : createSkinInstallCommand(selected)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											className: SkinMarket_module_css_default.copyCapsuleButton,
											variant: "outline",
											size: "sm",
											icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {}),
											"aria-label": installCopied === `${selected?.id}:command` ? "命令已复制" : "复制命令",
											title: "复制命令",
											onClick: () => void copyInstallOption("command")
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "安装前请确保已关闭其他皮肤插件，避免全局样式冲突；也可以复制提示词，让 Agent 先检查冲突再安装。" })
								] })
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: confirmRestart || compatibilityWarning !== null,
						onClose: () => {
							if (!restarting) {
								setConfirmRestart(false);
								setCompatibilityWarning(null);
							}
						},
						title: confirmRestart ? restartTarget?.kind === "market-update" ? "需要重启 DSH 应用皮肤市场更新" : "需要重启 DSH 应用此皮肤" : "兼容性提示",
						closeLabel: "关闭",
						description: confirmRestart ? restarting ? "正在重新启动 DSH，请稍候…" : runningAgents === null && !restartCheckFinished ? "正在检查是否有 Agent 运行。状态确认前不能重启。" : runningAgents === null ? "当前 Host 尚未加载安全检查。请确认没有 Agent 正在运行、重要内容已保存；你可以继续完成这一次升级重启。新版本加载后会自动检测 Agent 状态。" : runningAgents > 0 ? `检测到 ${runningAgents} 个 Agent 正在运行，现在不能重启。请等待任务完全结束后再试，否则可能中断任务并导致会话历史无法加载。` : restartTarget?.kind === "market-update" ? `Agent 状态检查已通过。但重启仍会关闭所有会话连接；即使回复已经停止显示，也请确认重要内容已保存，且没有即将开始的新任务。皮肤市场新版本 ${marketUpdate?.latestVersion ?? ""} 将在重启后生效。` : "Agent 状态检查已通过。但重启仍会关闭所有会话连接；即使回复已经停止显示，也请确认重要内容已保存，且没有即将开始的新任务。" : void 0,
						footer: confirmRestart ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							disabled: restarting,
							onClick: () => {
								setConfirmRestart(false);
								setCompatibilityWarning(null);
							},
							children: "稍后"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "sm",
							disabled: restarting || runningAgents === null && !restartCheckFinished || (runningAgents ?? 0) > 0,
							onClick: () => void restartNow(),
							children: restarting ? "正在重启…" : runningAgents === null && !restartCheckFinished ? "正在检查…" : runningAgents === null ? "我已确认无任务，仍然重启" : runningAgents > 0 ? "有任务运行中" : "确认无任务，立即重启"
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							size: "sm",
							onClick: () => setCompatibilityWarning(null),
							children: "知道了"
						}),
						children: compatibilityWarning !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CompatibilityWarningNote, { assessment: compatibilityWarning })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: showSubmission,
						onClose: () => setShowSubmission(false),
						title: "提交你的皮肤",
						closeLabel: "关闭",
						description: "复制下面的提示词交给你的 Agent，它会确认皮肤仓库、完成检查并准备市场 PR。",
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							onClick: () => setShowSubmission(false),
							children: "关闭"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
		async function switchClientSkin(runtime, packageNames, target, preserved = []) {
			const keep = /* @__PURE__ */ new Set([...preserved, target]);
			for (const packageName of packageNames) if (!keep.has(packageName)) await runtime.setActive(packageName, false);
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