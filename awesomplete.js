/**
 * Simple, lightweight, usable local autocomplete library for modern browsers
 * Because there weren’t enough autocomplete scripts in the world? Because I’m completely insane and have NIH syndrome? Probably both. :P
 * @author Lea Verou http://leaverou.github.io/awesomplete
 * MIT license
 */

(function () {

var _ = function (input, o) {
	var me = this;

		// 为什么添加 instance id
		// https://github.com/LeaVerou/awesomplete/pull/17068
		//
    // Keep track of number of instances for unique IDs
    Awesomplete.count = (Awesomplete.count || 0) + 1;
    this.count = Awesomplete.count;

	// Setup

	this.isOpened = false;

	this.input = $(input);
	this.input.setAttribute("autocomplete", "off");
	this.input.setAttribute("aria-owns", "awesomplete_list_" + this.count);
	this.input.setAttribute("role", "combobox");

	o = o || {};

  // 读取 options，并添加到 instance 上
	configure(this, {
		minChars: 2,
		maxItems: 10,
		autoFirst: false,
		data: _.DATA,
		filter: _.FILTER_CONTAINS,
		sort: o.sort === false ? false : _.SORT_BYLENGTH,
		item: _.ITEM,
		replace: _.REPLACE
	}, o);

	this.index = -1;

	// Create necessary elements

	this.container = $.create("div", {
		className: "awesomplete",
		around: input
	});

	this.ul = $.create("ul", {
		hidden: "hidden",
        role: "listbox",
        id: "awesomplete_list_" + this.count,
		inside: this.container
	});

  // status 是过滤结果提示，用于 AT
	this.status = $.create("span", {
		className: "visually-hidden",
		role: "status",
		"aria-live": "assertive",
        "aria-atomic": true,
        inside: this.container,
        textContent: this.minChars != 0 ? ("Type " + this.minChars + " or more characters for results.") : "Begin typing for results."
	});

	// Bind events

	this._events = {
		input: {
			"input": this.evaluate.bind(this),
			"blur": this.close.bind(this, { reason: "blur" }),
			// 下拉列表的选择，事件实际绑定在 input 上
			"keydown": function(evt) {
				var c = evt.keyCode;

				// If the dropdown `ul` is in view, then act on keydown for the following keys:
				// Enter / Esc / Up / Down
				if(me.opened) {
					if (c === 13 && me.selected) { // Enter
						evt.preventDefault();
						me.select();
					}
					else if (c === 27) { // Esc
						me.close({ reason: "esc" });
					}
					else if (c === 38 || c === 40) { // Down/Up arrow
						evt.preventDefault();
						me[c === 38? "previous" : "next"]();
					}
				}
			}
		},
		form: {
			"submit": this.close.bind(this, { reason: "submit" })
		},
		// 点击下拉列表
		ul: {
			"mousedown": function(evt) {
				var li = evt.target;

				if (li !== this) {
					// 用 RegExp 还是用 === 比较好？
					while (li && !/li/i.test(li.nodeName)) {
						li = li.parentNode;
					}

					if (li && evt.button === 0) {  // Only select on left click
						// 阻止 input blur
						// /yan/events.html
						evt.preventDefault();
						me.select(li, evt.target);
					}
				}
			}
		}
	};

	$.bind(this.input, this._events.input);
	$.bind(this.input.form, this._events.form);
	$.bind(this.ul, this._events.ul);

	// 设置 list, 优先次序 list attr > data-list attr > options.list
	// this.list 是一个 setter
	if (this.input.hasAttribute("list")) {
		this.list = "#" + this.input.getAttribute("list");
		this.input.removeAttribute("list");
	}
	else {
		this.list = this.input.getAttribute("data-list") || o.list || [];
	}

  // 用于 destroy
	_.all.push(this);
};

_.prototype = {
	// list 是 setter, back store 为 this._list
	set list(list) {
		// [], 由 options.list 指定
		if (Array.isArray(list)) {
			this._list = list;
		}
		// list string, 由 input[data-list] 或 options.list 指定
		else if (typeof list === "string" && list.indexOf(",") > -1) {
				this._list = list.split(/\s*,\s*/);
		}
		// 由 input[list] 或 options.list 指定
		else { // Element or CSS selector
			list = $(list);

			if (list && list.children) {
				var items = [];
				slice.apply(list.children).forEach(function (el) {
					if (!el.disabled) {
						var text = el.textContent.trim();
						var value = el.value || text;
						var label = el.label || text;
						if (value !== "") {
							items.push({ label: label, value: value });
						}
					}
				});
				this._list = items;
			}
		}

    // input 已有值，比如刷新页面
		if (document.activeElement === this.input) {
			this.evaluate();
		}
	},

	get selected() {
		return this.index > -1;
	},

	get opened() {
		return this.isOpened;
	},

	close: function (o) {
		if (!this.opened) {
			return;
		}

    // 通过 hidden attribute 显示隐藏
		this.ul.setAttribute("hidden", "");
		this.isOpened = false;
		this.index = -1;

		// o.reason 关闭 popup 的原因
		$.fire(this.input, "awesomplete-close", o || {});
	},

	open: function () {
		this.ul.removeAttribute("hidden");
		this.isOpened = true;

		// options.autoFirst 自动选择第一个
		if (this.autoFirst && this.index === -1) {
			this.goto(0);
		}

		$.fire(this.input, "awesomplete-open");
	},

	destroy: function() {
		//remove events from the input and its form
		$.unbind(this.input, this._events.input);
		$.unbind(this.input.form, this._events.form);

		//move the input out of the awesomplete container and remove the container and its children
		var parentNode = this.container.parentNode;

		parentNode.insertBefore(this.input, this.container);
		parentNode.removeChild(this.container);

		//remove autocomplete and aria-autocomplete attributes
		this.input.removeAttribute("autocomplete");
		this.input.removeAttribute("aria-autocomplete");

		//remove this awesomeplete instance from the global array of instances
		var indexOfAwesomplete = _.all.indexOf(this);

		if (indexOfAwesomplete !== -1) {
			_.all.splice(indexOfAwesomplete, 1);
		}
	},

	next: function () {
		var count = this.ul.children.length;
		this.goto(this.index < count - 1 ? this.index + 1 : (count ? 0 : -1) );
	},

	previous: function () {
		var count = this.ul.children.length;
		var pos = this.index - 1;

		this.goto(this.selected && pos !== -1 ? pos : count - 1);
	},

	// Should not be used, highlights specific item without any checks!
	goto: function (i) {
		var lis = this.ul.children;

		if (this.selected) {
			lis[this.index].setAttribute("aria-selected", "false");
		}

		this.index = i;

		if (i > -1 && lis.length > 0) {
			lis[i].setAttribute("aria-selected", "true");

			this.status.textContent = lis[i].textContent + ", list item " + (i + 1) + " of " + lis.length;

            this.input.setAttribute("aria-activedescendant", this.ul.id + "_item_" + this.index);

			// scroll to highlighted element in case parent's height is fixed
			this.ul.scrollTop = lis[i].offsetTop - this.ul.clientHeight + lis[i].clientHeight;

			$.fire(this.input, "awesomplete-highlight", {
				text: this.suggestions[this.index]
			});
		}
	},

	select: function (selected, origin) {
		if (selected) {
			this.index = $.siblingIndex(selected);
		} else {
			selected = this.ul.children[this.index];
		}

		if (selected) {
			var suggestion = this.suggestions[this.index];

			var allowed = $.fire(this.input, "awesomplete-select", {
				text: suggestion,
				origin: origin || selected
			});

			if (allowed) {
				// options.replace
				// 示例 Multiple values
				this.replace(suggestion);
				this.close({ reason: "select" });
				$.fire(this.input, "awesomplete-selectcomplete", {
					text: suggestion
				});
			}
		}
	},

	// 生成列表
	evaluate: function() {
		var me = this;
		var value = this.input.value;

		// options.minChars 最少输入字数
		if (value.length >= this.minChars && this._list.length > 0) {
			this.index = -1;
			// Populate list with options that match
			// 清空内容可以用 .textContent = ''
			this.ul.innerHTML = "";

			// 过滤
			this.suggestions = this._list
				.map(function(item) {
					// options.data: _.DATA
					// fn(listItem, inputValue)
					return new Suggestion(me.data(item, value));
				})
				.filter(function(item) {
					// options.filter: _.FILTER_CONTAINS
					// fn(suggestion, inputValue)
					// suggestion.toString() => suggest.label，即对 label 过滤
					return me.filter(item, value);
				});

			// 排序，在过滤之后插入之前
			// options.sort: false
			if (this.sort !== false) {
				this.suggestions = this.suggestions.sort(this.sort);
			}

			// options.maxItems 候选列表最大个数
			this.suggestions = this.suggestions.slice(0, this.maxItems);

			// 插入
			this.suggestions.forEach(function(text, index) {
					// options.item: _.ITEM
					me.ul.appendChild(me.item(text, value, index));
				});

			if (this.ul.children.length === 0) {

                this.status.textContent = "No results found";

				this.close({ reason: "nomatches" });

			} else {
				this.open();

                this.status.textContent = this.ul.children.length + " results found";
			}
		}
		else {
			this.close({ reason: "nomatches" });

                this.status.textContent = "No results found";
		}
	}
};

// Static methods/properties

_.all = [];

_.FILTER_CONTAINS = function (text, input) {
	return RegExp($.regExpEscape(input.trim()), "i").test(text);
};

_.FILTER_STARTSWITH = function (text, input) {
	return RegExp("^" + $.regExpEscape(input.trim()), "i").test(text);
};

_.SORT_BYLENGTH = function (a, b) {
	if (a.length !== b.length) {
		return a.length - b.length;
	}

	return a < b? -1 : 1;
};

// 生成 <li>
_.ITEM = function (text, input, item_id) {
	// <mark> 高亮 input, 用 re 匹配 input 之前先对它转义，去掉特殊字符
	var html = input.trim() === "" ? text : text.replace(RegExp($.regExpEscape(input.trim()), "gi"), "<mark>$&</mark>");
	return $.create("li", {
		innerHTML: html,
		"aria-selected": "false",
        "id": "awesomplete_list_" + this.count + "_item_" + item_id
	});
};

_.REPLACE = function (text) {
	this.input.value = text.value;
};

_.DATA = function (item/*, input*/) { return item; };

// Private functions

// Suggestion 继承自 String
// 修改 length, toString, valueOf；添加 label, value
// 这么做好吗
//
// data 类型
// array: [label, value]
// object: {label, value}
// string
function Suggestion(data) {
	var o = Array.isArray(data)
	  ? { label: data[0], value: data[1] }
	  : typeof data === "object" && "label" in data && "value" in data ? data : { label: data, value: data };

	this.label = o.label || o.value;
	this.value = o.value;
}
Object.defineProperty(Suggestion.prototype = Object.create(String.prototype), "length", {
	get: function() { return this.label.length; }
});
Suggestion.prototype.toString = Suggestion.prototype.valueOf = function () {
	return "" + this.label;
};

// 将配置合并到 instance 上 (instance, defaults, options)
// 这么做好吗
function configure(instance, properties, o) {
	// 以 defaults 为基准
	for (var i in properties) {
    // 第一步，合并 dataset
		var initial = properties[i],
				// dataset, IE11 支持，IE<11 用 getAttribute
		    attrValue = instance.input.getAttribute("data-" + i.toLowerCase());

		// number，转为 number
		if (typeof initial === "number") {
			instance[i] = parseInt(attrValue);
		}
		// boolean，data-* 只要存在即为 true
		else if (initial === false) { // Boolean options must be false by default anyway
			instance[i] = attrValue !== null;
		}
		// function, dataset 不能设置，设为 null，后面处理 options 时添加回来
		else if (initial instanceof Function) {
			instance[i] = null;
		}
		// string
		else {
			instance[i] = attrValue;
		}

		// 第二步，合并 options
		// 只考虑 instance[i] 为 null
		if (!instance[i] && instance[i] !== 0) {
			instance[i] = (i in o)? o[i] : initial;
		}
	}
}

// Helpers

var slice = Array.prototype.slice;

// con 为 context
function $(expr, con) {
	return typeof expr === "string"? (con || document).querySelector(expr) : expr || null;
}

function $$(expr, con) {
	return slice.call((con || document).querySelectorAll(expr));
}

// 创建 element
$.create = function(tag, o) {
	var element = document.createElement(tag);

	for (var i in o) {
		var val = o[i];

		if (i === "inside") {
			$(val).appendChild(element);
		}
		else if (i === "around") {
			var ref = $(val);
			ref.parentNode.insertBefore(element, ref);
			element.appendChild(ref);
		}
		// props
		else if (i in element) {
			element[i] = val;
		}
		// attrs
		else {
			element.setAttribute(i, val);
		}
	}

	return element;
};

$.bind = function(element, o) {
	if (element) {
		for (var event in o) {
			var callback = o[event];

			event.split(/\s+/).forEach(function (event) {
				element.addEventListener(event, callback);
			});
		}
	}
};

$.unbind = function(element, o) {
	if (element) {
		for (var event in o) {
			var callback = o[event];

			event.split(/\s+/).forEach(function(event) {
				element.removeEventListener(event, callback);
			});
		}
	}
};

$.fire = function(target, type, properties) {
	var evt = document.createEvent("HTMLEvents");

	evt.initEvent(type, true, true );

	for (var j in properties) {
		evt[j] = properties[j];
	}

	return target.dispatchEvent(evt);
};

$.regExpEscape = function (s) {
	return s.replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&");
};

$.siblingIndex = function (el) {
	/* eslint-disable no-cond-assign */
	for (var i = 0; el = el.previousElementSibling; i++);
	return i;
};

// Initialization

function init() {
	$$("input.awesomplete").forEach(function (input) {
		new _(input);
	});
}

// Are we in a browser? Check for Document constructor
if (typeof Document !== "undefined") {
	// DOM already loaded?
	if (document.readyState !== "loading") {
		init();
	}
	else {
		// Wait for it
		document.addEventListener("DOMContentLoaded", init);
	}
}

_.$ = $;
_.$$ = $$;

// Make sure to export Awesomplete on self when in a browser
if (typeof self !== "undefined") {
	self.Awesomplete = _;
}

// Expose Awesomplete as a CJS module
if (typeof module === "object" && module.exports) {
	module.exports = _;
}

return _;

}());
