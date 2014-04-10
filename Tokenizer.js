module.exports = Tokenizer;

var decodeCodePoint = require("entities/lib/decode_codepoint.js"),
    entityMap = require("entities/maps/entities.json"),
    legacyMap = require("entities/maps/legacy.json"),
    xmlMap    = require("entities/maps/xml.json"),

    DATA                      = "DATA",
    RCDATA_STATE              = "RCDATA_STATE",
    RAWTEXT_STATE             = "RAWTEXT_STATE",
    SCRIPT_DATA_STATE         = "SCRIPT_DATA_STATE",
    PLAINTEXT_STATE           = "PLAINTEXT_STATE",

    TAG_OPEN                  = "TAG_OPEN", //after <
    TAG_NAME                  = "TAG_NAME",
    SELF_CLOSING_START_TAG    = "SELF_CLOSING_START_TAG",
    END_TAG_OPEN              = "END_TAG_OPEN",
    IN_CLOSING_TAG_NAME       = "IN_CLOSING_TAG_NAME",
    AFTER_CLOSING_TAG_NAME    = "AFTER_CLOSING_TAG_NAME",

    //attributes
    BEFORE_ATTRIBUTE_NAME     = "BEFORE_ATTRIBUTE_NAME",
    ATTRIBUTE_NAME            = "ATTRIBUTE_NAME",
    AFTER_ATTRIBUTE_NAME      = "AFTER_ATTRIBUTE_NAME",
    BEFORE_ATTRIBUTE_VALUE    = "BEFORE_ATTRIBUTE_VALUE",
    ATTRIBUTE_VALUE_DQ        = "ATTRIBUTE_VALUE_DQ", // "
    ATTRIBUTE_VALUE_SQ        = "ATTRIBUTE_VALUE_SQ", // '
    ATTRIBUTE_VALUE_NQ        = "ATTRIBUTE_VALUE_NQ",

    //comments
    MARKUP_DECLARATION_OPEN   = "MARKUP_DECLARATION_OPEN", // !
    BOGUS_COMMENT             = "BOGUS_COMMENT",
    BEFORE_COMMENT            = "BEFORE_COMMENT",
    COMMENT_START             = "COMMENT_START",
    COMMENT_START_DASH        = "COMMENT_START_DASH",
    COMMENT                   = "COMMENT",
    COMMENT_END_DASH          = "COMMENT_END_DASH",
    COMMENT_END               = "COMMENT_END",
    COMMENT_END_BANG          = "COMMENT_END_BANG",

    //cdata
    BEFORE_CDATA              = "BEFORE_CDATA",
    IN_CDATA                  = "IN_CDATA",
    AFTER_CDATA_1             = "AFTER_CDATA_1",  // ]
    AFTER_CDATA_2             = "AFTER_CDATA_2",  // ]

    BEFORE_ENTITY             = "BEFORE_ENTITY", //&
    BEFORE_NUMERIC_ENTITY     = "BEFORE_NUMERIC_ENTITY", //#
    IN_NAMED_ENTITY           = "IN_NAMED_ENTITY",
    IN_NUMERIC_ENTITY         = "IN_NUMERIC_ENTITY",
    IN_HEX_ENTITY             = "IN_HEX_ENTITY", //X

    END_TAG_NAME_STATE        = "END_TAG_NAME_STATE",

    RCDATA_LESS_THAN_SIGN_STATE = "RCDATA_LESS_THAN_SIGN_STATE",
    RAWTEXT_LESS_THAN_SIGN_STATE = "RAWTEXT_LESS_THAN_SIGN_STATE",

    SCRIPT_DATA_LESS_THAN_SIGN_STATE = "SCRIPT_DATA_LESS_THAN_SIGN_STATE",
    SCRIPT_DATA_ESCAPE_START_STATE = "SCRIPT_DATA_ESCAPE_START_STATE",
    SCRIPT_DATA_ESCAPE_START_DASH_STATE = "SCRIPT_DATA_ESCAPE_START_DASH_STATE",
    SCRIPT_DATA_ESCAPED_STATE = "SCRIPT_DATA_ESCAPED_STATE",
    SCRIPT_DATA_ESCAPED_DASH_STATE = "SCRIPT_DATA_ESCAPED_DASH_STATE",
    SCRIPT_DATA_ESCAPED_DASH_DASH_STATE = "SCRIPT_DATA_ESCAPED_DASH_DASH_STATE",
    SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN_STATE = "SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN_STATE",
    SCRIPT_DATA_ESCAPED_END_TAG_OPEN_STATE = "SCRIPT_DATA_ESCAPED_END_TAG_OPEN_STATE",
    SCRIPT_DATA_ESCAPED_END_TAG_NAME_STATE = "SCRIPT_DATA_ESCAPED_END_TAG_NAME_STATE",
    SCRIPT_DATA_DOUBLE_ESCAPE_START_STATE = "SCRIPT_DATA_DOUBLE_ESCAPE_START_STATE",
    SCRIPT_DATA_DOUBLE_ESCAPED_STATE = "SCRIPT_DATA_DOUBLE_ESCAPED_STATE",
    SCRIPT_DATA_DOUBLE_ESCAPED_DASH_STATE = "SCRIPT_DATA_DOUBLE_ESCAPED_DASH_STATE",
    SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH_STATE = "SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH_STATE",
    SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN_STATE = "SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN_STATE",
    SCRIPT_DATA_DOUBLE_ESCAPE_END_STATE = "SCRIPT_DATA_DOUBLE_ESCAPE_END_STATE",

    BEFORE_DOCTYPE_NAME       = "BEFORE_DOCTYPE_NAME",
    DOCTYPE_NAME              = "DOCTYPE_NAME",
    AFTER_DOCTYPE_NAME        = "AFTER_DOCTYPE_NAME",
    AFTER_DT_PUBLIC           = "AFTER_DT_PUBLIC",
    BOGUS_EVIL_DOCTYPE        = "BOGUS_EVIL_DOCTYPE",
    BOGUS_DOCTYPE             = "BOGUS_DOCTYPE",
    AFTER_DT_SYSTEM           = "AFTER_DT_SYSTEM",
    DT_SYSTEM_DQ              = "DT_SYSTEM_DQ",
    DT_SYSTEM_SQ              = "DT_SYSTEM_SQ",
    DT_PUBLIC_DQ              = "DT_PUBLIC_DQ",
    DT_PUBLIC_SQ              = "DT_PUBLIC_SQ",
    DT_BETWEEN_PUB_SYS        = "DT_BETWEEN_PUB_SYS",
    AFTER_DT_SYSTEM_IDENT     = "AFTER_DT_SYSTEM_IDENT",

    SEQUENCE                  = "SEQUENCE",

    REPLACEMENT_CHARACTER     = "\ufffd";

function whitespace(c){
	return c === " " || c === "\n" || c === "\t" || c === "\f" || c === "\r";
}

function isLetter(c){
	return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

function isAttributeState(state){
	return state === ATTRIBUTE_VALUE_NQ || state === ATTRIBUTE_VALUE_SQ || state === ATTRIBUTE_VALUE_DQ;
}

function characterState(char, SUCCESS){
	return function(c){
		if(c === char) this._state = SUCCESS;
	};
}

function ifElseState(char, SUCCESS, FAILURE){
	return function(c){
		if(c === char){
			this._state = SUCCESS;
		} else {
			 this._state = FAILURE;
			 this._index--;
		}
	};
}

function Tokenizer(cbs, options){
	this._state = DATA;
	this._buffer = "";
	this._sectionStart = 0;
	this._index = 0;
	this._baseState = DATA;
	this._nextState = DATA;
	this._sequence = "";
	this._sequenceIndex = 0;
	this._cbs = cbs;
	this._running = true;
	this._ended = false;
	this._xmlMode = !!(options && options.xmlMode);
	this._decodeEntities = !!(options && options.decodeEntities);

	this._nameBuffer = null;
	this._valueBuffer = null;
	this._systemBuffer = null;
}

var _$ = Tokenizer.prototype;

Tokenizer.prototype._consumeSequence = function(seq, SUCCESS, FAILURE){
	this._sequence = seq;
	this._nextState = SUCCESS;
	this._baseState = FAILURE;
	this._state = SEQUENCE;
	this._sequenceIndex = 0;
};

_$[SEQUENCE] = function(c){
	var comp = this._sequence.charAt(this._sequenceIndex);
	if(c === comp || c.toLowerCase() === comp){
		this._sequenceIndex += 1;
		if(this._sequenceIndex === this._sequence.length){
			this._state = this._nextState;
		}
	} else {
		this._state = this._baseState;
		this._index--;
	}
};

function textState(LESS_THAN_SIGN_STATE){
	return function(c){
		if(c === "<"){
			if(this._index > this._sectionStart){
				this._cbs.ontext(this._getSection());
			}
			this._state = LESS_THAN_SIGN_STATE;
			this._sectionStart = this._index;
		} else if(c === "\0"){
			// parse error
			if(this._index > this._sectionStart){
				this._cbs.ontext(this._getSection());
			}
			this._cbs.ontext(REPLACEMENT_CHARACTER);
			this._sectionStart = this._index + 1;
		}
	};
}

// 8.2.4.1 Data state

_$[DATA] = function(c){
	if(this._decodeEntities && c === "&"){
		if(this._index > this._sectionStart){
			this._cbs.ontext(this._getSection());
		}
		this._baseState = this._state;
		this._state = BEFORE_ENTITY;
		this._sectionStart = this._index;
	} else if(c === "<"){
		if(this._index > this._sectionStart){
			this._cbs.ontext(this._getSection());
		}
		this._state = TAG_OPEN;
		this._sectionStart = this._index;
	}
};

// 12.2.4.3 RCDATA state

_$[RCDATA_STATE] = function(c){
	if(this._decodeEntities && c === "&"){
		if(this._index > this._sectionStart){
			this._cbs.ontext(this._getSection());
		}
		this._baseState = this._state;
		this._state = BEFORE_ENTITY;
		this._sectionStart = this._index;
	} else if(c === "<"){
		if(this._index > this._sectionStart){
			this._cbs.ontext(this._getSection());
		}
		this._state = RCDATA_LESS_THAN_SIGN_STATE;
		this._sectionStart = this._index;
	} else if(c === "\0"){
		// parse error
		if(this._index > this._sectionStart){
			this._cbs.ontext(this._getSection());
		}
		this._cbs.ontext(REPLACEMENT_CHARACTER);
		this._sectionStart = this._index + 1;
	}
};

// 12.2.4.5 RAWTEXT state

_$[RAWTEXT_STATE] = textState(RAWTEXT_LESS_THAN_SIGN_STATE);


// 12.2.4.6 Script data state

_$[SCRIPT_DATA_STATE] = textState(SCRIPT_DATA_LESS_THAN_SIGN_STATE);


// 12.2.4.7 PLAINTEXT state

_$[PLAINTEXT_STATE] = function(c){
	if(c === "\0"){
		// parse error
		if(this._index > this._sectionStart){
			this._cbs.ontext(this._getSection());
		}
		this._cbs.ontext(REPLACEMENT_CHARACTER);
		this._sectionStart = this._index + 1;
	}
};

// 8.2.4.8 Tag open state

_$[TAG_OPEN] = function(c){
	//TODO recognize XML mode
	if(c === "!"){
		this._state = MARKUP_DECLARATION_OPEN;
		this._sectionStart = this._index + 1;
	} else if(c === "/"){
		this._state = END_TAG_OPEN;
	} else if(isLetter(c)){
		this._state = TAG_NAME;
		this._nameBuffer = "";
		this._sectionStart = this._index;
	} else if(c === "?"){
		// parse error
		this._state = BOGUS_COMMENT;
		this._sectionStart = this._index;
	} else {
		// parse error
		this._state = DATA;
	}
};

// 8.2.4.9 End tag open state

_$[END_TAG_OPEN] = function(c){
	if(isLetter(c)){
		this._state = IN_CLOSING_TAG_NAME;
		this._nameBuffer = "";
		this._sectionStart = this._index;
	} else if(c === ">"){
		// parse error
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else {
		// parse error
		this._state = BOGUS_COMMENT;
		this._sectionStart = this._index;
		this._index--;
	}
};

// 8.2.4.10 Tag name state

_$[TAG_NAME] = function(c){
	if(whitespace(c)){
		this._cbs.onopentagname(this._nameBuffer + this._getEndingSection());
		this._state = BEFORE_ATTRIBUTE_NAME;
	} else if(c === "/"){
		this._cbs.onopentagname(this._nameBuffer + this._getEndingSection());
		this._state = SELF_CLOSING_START_TAG;
	} else if(c === ">"){
		this._cbs.onopentagname(this._nameBuffer + this._getSection());
		this._cbs.onopentagend();
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else if(c === "\0"){
		this._nameBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
	}
};

function lessThanSignState(BASE_STATE, NEXT_STATE){
	return function(c){
		if(c === "/"){
			this._state = SEQUENCE;
			this._sequenceIndex = 0;
			this._nextState = NEXT_STATE;
			this._baseState = BASE_STATE;
		} else {
			this._state = BASE_STATE;
			this._index--;
		}
	};
}

_$[END_TAG_NAME_STATE] = function(c){
	if(whitespace(c) || c === "/"){
		this._nameBuffer = this._sequence;
		this._state = AFTER_CLOSING_TAG_NAME;
	} else if(c === ">"){
		this._cbs.onclosetag(this._sequence);
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else {
		this._state = this._baseState;
		this._index--;
	}
};

// 12.2.4.11 RCDATA less-than sign state

_$[RCDATA_LESS_THAN_SIGN_STATE] = lessThanSignState(RCDATA_STATE, END_TAG_NAME_STATE);

//skipped 12.2.4.12 RCDATA end tag open state (using SEQUENCE instead)
//skipped 12.2.4.13 RCDATA end tag name state
//_$[RCDATA_END_TAG_NAME_STATE] = endTagNameState;

// 12.2.4.14 RAWTEXT less-than sign state

_$[RAWTEXT_LESS_THAN_SIGN_STATE] = lessThanSignState(RAWTEXT_STATE, END_TAG_NAME_STATE);

//skipped 12.2.4.15 RAWTEXT end tag open state
//skipped 12.2.4.16 RAWTEXT end tag name state
//_$[RAWTEXT_END_TAG_NAME_STATE] = endTagNameState;

// 12.2.4.17 Script data less-than sign state

_$[SCRIPT_DATA_LESS_THAN_SIGN_STATE] = function(c){
	if(c === "/"){
		this._state = SEQUENCE;
		this._sequenceIndex = 0;
		this._nextState = END_TAG_NAME_STATE;
		this._baseState = SCRIPT_DATA_STATE;
	} else if(c === "!"){
		this._state = SCRIPT_DATA_ESCAPE_START_STATE;
	} else {
		this._state = SCRIPT_DATA_STATE;
		this._index--;
	}
};

//skipped 12.2.4.18 Script data end tag open state
//skipped  12.2.4.19 Script data end tag name state
//_$[SCRIPT_DATA_END_TAG_NAME_STATE] = endTagNameState;

// 12.2.4.20 Script data escape start state

_$[SCRIPT_DATA_ESCAPE_START_STATE] = ifElseState("-", SCRIPT_DATA_ESCAPE_START_DASH_STATE, SCRIPT_DATA_STATE);

// 12.2.4.21 Script data escape start dash state

_$[SCRIPT_DATA_ESCAPE_START_DASH_STATE] = ifElseState("-", SCRIPT_DATA_ESCAPED_DASH_DASH_STATE, SCRIPT_DATA_STATE);

//TODO support remaining SCRIPT_DATA states

// 8.2.4.34 Before attribute name state

_$[BEFORE_ATTRIBUTE_NAME] = function(c){
	if(c === ">"){
		this._cbs.onopentagend();
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else if(c === "/"){
		this._state = SELF_CLOSING_START_TAG;
	} else if(!whitespace(c)){
		// parse error (c === "\"" || c === "'" || c === "<" || c === "=")
		this._state = ATTRIBUTE_NAME;
		if(c === "\0"){
			this._nameBuffer = REPLACEMENT_CHARACTER;
			this._sectionStart = this._index + 1;
		} else {
			this._nameBuffer = "";
			this._sectionStart = this._index;
		}
	}
};

// 8.2.4.35 Attribute name state
//FIXME simplified

_$[ATTRIBUTE_NAME] = function(c){
	if(c === "=" || c === "/" || c === ">" || whitespace(c)){
		this._nameBuffer += this._getEndingSection();
		this._valueBuffer = "";
		this._state = AFTER_ATTRIBUTE_NAME;
		this._index--;
	} else if(c === "\0"){
		this._nameBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
	}
};

// 8.2.4.36 After attribute name state

_$[AFTER_ATTRIBUTE_NAME] = function(c){
	if(c === "="){
		this._state = BEFORE_ATTRIBUTE_VALUE;
	} else if(c === "/"){
		this._cbs.onattribute(this._nameBuffer, "");
		this._nameBuffer = null;
		this._state = SELF_CLOSING_START_TAG;
	} else if(c === ">"){
		this._cbs.onattribute(this._nameBuffer, "");
		this._nameBuffer = null;
		this._cbs.onopentagend();
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else if(!whitespace(c)){
		// parse error (c === "\"" || c === "'" || c === "<")
		this._cbs.onattribute(this._nameBuffer, "");
		this._state = ATTRIBUTE_NAME;

		if(c === "\0"){
			this._nameBuffer = REPLACEMENT_CHARACTER;
			this._sectionStart = this._index + 1;
		} else {
			this._nameBuffer = "";
			this._sectionStart = this._index;
		}
	}
};

// 8.2.4.37 Before attribute value state

_$[BEFORE_ATTRIBUTE_VALUE] = function(c){
	if(c === "\""){
		this._state = ATTRIBUTE_VALUE_DQ;
		this._valueBuffer = "";
		this._sectionStart = this._index + 1;
	} else if(c === "'"){
		this._state = ATTRIBUTE_VALUE_SQ;
		this._valueBuffer = "";
		this._sectionStart = this._index + 1;
	} else if(c === ">"){
		// parse error
		this._cbs.onattribute(this._nameBuffer, "");
		this._nameBuffer = null;
		this._cbs.onopentagend();
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else if(!whitespace(c)){
		// parse error (c === "<" || c === "=")
		this._state = ATTRIBUTE_VALUE_NQ;
		this._valueBuffer = "";
		this._sectionStart = this._index;
		this._index--;
	}
};

function attributeValueQuotedState(QUOT){
	return function(c){
		if(c === QUOT){
			this._cbs.onattribute(this._nameBuffer, this._valueBuffer + this._getEndingSection());
			this._nameBuffer = this._valueBuffer = null;
			this._state = BEFORE_ATTRIBUTE_NAME;
		} else if(this._decodeEntities && c === "&"){
			this._valueBuffer += this._getSection();
			this._baseState = this._state;
			this._state = BEFORE_ENTITY;
			this._sectionStart = this._index;
		} else if(c === "\0"){
			// parse error
			this._valueBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
		}
	};
}

// 8.2.4.38 Attribute value (double-quoted) state
// 8.2.4.39 Attribute value (single-quoted) state

_$[ATTRIBUTE_VALUE_DQ] = attributeValueQuotedState("\"");
_$[ATTRIBUTE_VALUE_SQ] = attributeValueQuotedState("'");

// 8.2.4.40 Attribute value (unquoted) state

_$[ATTRIBUTE_VALUE_NQ] = function(c){
	if(whitespace(c)){
		this._cbs.onattribute(this._nameBuffer, this._valueBuffer + this._getEndingSection());
		this._nameBuffer = this._valueBuffer = null;
		this._state = BEFORE_ATTRIBUTE_NAME;
	} else if(c === ">"){
		this._cbs.onattribute(this._nameBuffer, this._valueBuffer + this._getPartialSection());
		this._nameBuffer = this._valueBuffer = null;
		this._cbs.onopentagend();
		this._state = DATA;
	} else if(this._decodeEntities && c === "&"){
		this._valueBuffer += this._getSection();
		this._baseState = this._state;
		this._state = BEFORE_ENTITY;
		this._sectionStart = this._index;
	} else if(c === "\0"){
		// parse error
		this._valueBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
	}
	// parse error (c === "\"" || c === "'" || c === "<" || c === "=" || c === "`")
};

// Ignored 8.2.4.42 After attribute value (quoted) state

// 8.2.4.43 Self-closing start tag state

_$[SELF_CLOSING_START_TAG] = function(c){
	if(c === ">"){
		this._cbs.onselfclosingtag();
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else {
		this._state = BEFORE_ATTRIBUTE_NAME;
		this._index--;
	}
};

// 8.2.4.44 Bogus comment state

_$[BOGUS_COMMENT] = function(c){
	if(c === ">"){
		this._cbs.oncomment(this._getPartialSection());
		this._cbs.oncommentend();
		this._state = DATA;
	} else if(c === "\0"){
		this._cbs.oncomment(this._getPartialSection() + REPLACEMENT_CHARACTER);
		this._sectionStart = this._index + 1;
	}
};

// 8.2.4.45 Markup declaration open state

_$[MARKUP_DECLARATION_OPEN] = function(c){
	this._sectionStart = this._index;

	if(c === "-"){
		this._state = BEFORE_COMMENT;
	} else if(c === "d" || c === "D"){
		this._consumeSequence("octype", BEFORE_DOCTYPE_NAME, BOGUS_COMMENT);
	} else if(c === "["){ //TODO check context?
		this._consumeSequence("CDATA", BEFORE_CDATA, BOGUS_COMMENT);
	} else {
		this._state = BOGUS_COMMENT;
		this._index--;
	}
};

_$[BEFORE_COMMENT] = function(c){
	if(c === "-"){
		this._state = COMMENT_START;
		this._sectionStart = this._index + 1;
	} else {
		this._state = BOGUS_COMMENT;
	}
};

// 8.2.4.46 Comment start state

_$[COMMENT_START] = function(c){
	if(c === "-"){
		this._state = COMMENT_START_DASH;
	} else if(c === ">"){
		// parse error
		this._cbs.oncomment("");
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else {
		this._state = COMMENT;
		this._index--;
	}
};

// 8.2.4.47 Comment start dash state

_$[COMMENT_START_DASH] = function(c){
	if(c === "-"){
		this._state = COMMENT_END;
	} else if(c === ">"){
		// parse error
		this._cbs.oncomment("");
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else {
		this._state = COMMENT;
		this._index--;
	}
};

// 8.2.4.48 Comment state

_$[COMMENT] = function(c){
	if(c === "-"){
		this._state = COMMENT_END_DASH;
	} else if(c === "\0"){
		// parse error
		this._cbs.oncomment(this._getPartialSection() + REPLACEMENT_CHARACTER);
		this._sectionStart = this._index + 1;
	}
};

// 8.2.4.49 Comment end dash state

_$[COMMENT_END_DASH] = ifElseState("-", COMMENT_END, COMMENT);

// 8.2.4.50 Comment end state

_$[COMMENT_END] = function(c){
	if(c === ">"){
		//remove 2 trailing chars
		this._cbs.oncomment(this._buffer.substring(this._sectionStart, this._index - 2));
		this._cbs.oncommentend();
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else if(c === "!"){
		// parse error
		this._state = COMMENT_END_BANG;
	} else if(c !== "-"){
		this._state = COMMENT;
		this._index--;
	}
	// else: parse error, stay in COMMENT_END (`--->`)
};

// 8.2.4.51 Comment end bang state

_$[COMMENT_END_BANG] = function(c){
	if(c === ">"){
		//remove trailing --!
		this._cbs.oncomment(this._buffer.substring(this._sectionStart, this._index - 3));
		this._cbs.oncommentend();
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else if(c === "-"){
		this._state = COMMENT_END_DASH;
	} else {
		this._state = COMMENT;
		this._index--;
	}
};

_$[IN_CLOSING_TAG_NAME] = function(c){
	if(whitespace(c) || c === "/"){
		this._nameBuffer += this._getEndingSection();
		this._state = AFTER_CLOSING_TAG_NAME;
	} else if(c === ">"){
		this._cbs.onclosetag(this._nameBuffer + this._getPartialSection());
		this._state = DATA;
	} else if(c === "\0"){
		this._nameBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
	}
};

_$[AFTER_CLOSING_TAG_NAME] = function(c){
	//skip everything until ">"
	if(c === ">"){
		this._cbs.onclosetag(this._nameBuffer);
		this._sectionStart = this._index + 1;
		this._state = DATA;
	}
};

// Ignored: 8.2.4.52 DOCTYPE state - parse error when whitespace missing (<!DOCTYPEfoo>)

// 8.2.4.53 Before DOCTYPE name state
_$[BEFORE_DOCTYPE_NAME] = function(c){
	if(whitespace(c));
	else if(c === ">"){
		this._cbs.ondoctype(null, null, null, false);
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else {
		this._state = DOCTYPE_NAME;

		if(c === "\0"){
			this._nameBuffer = REPLACEMENT_CHARACTER;
			this._sectionStart = this._index + 1;
		} else {
			this._nameBuffer = "";
			this._sectionStart = this._index;
		}
	}
};

// 8.2.4.54 DOCTYPE name state
_$[DOCTYPE_NAME] = function(c){
	if(whitespace(c)){
		this._nameBuffer += this._getEndingSection();
		this._state = AFTER_DOCTYPE_NAME;
	} else if(c === ">"){
		this._cbs.ondoctype(this._nameBuffer + this._getPartialSection(), null, null, true);
		this._nameBuffer = null;
		this._state = DATA;
	} else if(c === "\0"){
		this._nameBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
	}
};

// 8.2.4.55 After DOCTYPE name state
_$[AFTER_DOCTYPE_NAME] = function(c){
	if(c === ">"){
		this._cbs.ondoctype(this._nameBuffer, null, null, true);
		this._nameBuffer = null;
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else if(c === "P" || c === "p"){
		this._consumeSequence("ublic", AFTER_DT_PUBLIC, BOGUS_EVIL_DOCTYPE);
	} else if(c === "S" || c === "s"){
		this._consumeSequence("ystem", AFTER_DT_SYSTEM, BOGUS_EVIL_DOCTYPE);
	} else {
		this._state = BOGUS_EVIL_DOCTYPE;
	}
};

// 8.2.4.56 After DOCTYPE public keyword state
// Ignored 8.2.4.57 Before DOCTYPE public identifier state

_$[AFTER_DT_PUBLIC] = function(c){
	if(whitespace(c));
	else if(c === ">"){
		this._cbs.ondoctype(this._nameBuffer, null, null, false);
		this._nameBuffer = null;
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else if(c === "\""){
		this._state = DT_PUBLIC_DQ;
		this._valueBuffer = "";
		this._sectionStart = this._index + 1;
	} else if(c === "'"){
		this._state = DT_PUBLIC_SQ;
		this._valueBuffer = "";
		this._sectionStart = this._index + 1;
	} else {
		this._state = BOGUS_EVIL_DOCTYPE;
	}
};

function doctypePublicQuotedState(quot){
	return function(c){
		if(c === quot){
			this._valueBuffer += this._getEndingSection();
			this._state = DT_BETWEEN_PUB_SYS;
		} else if(c === ">"){
			// parse error
			this._cbs.ondoctype(this._nameBuffer, this._valueBuffer + this._getPartialSection(), null, false);
			this._nameBuffer = this._valueBuffer = null;
			this._state = DATA;
		} else if(c === "\0"){
			this._valueBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
		}
	};
}

// 8.2.4.58 DOCTYPE public identifier (double-quoted) state
// 8.2.4.59 DOCTYPE public identifier (single-quoted) state

_$[DT_PUBLIC_DQ] = doctypePublicQuotedState("\"");
_$[DT_PUBLIC_SQ] = doctypePublicQuotedState("'");

// Ignored 8.2.4.60 After DOCTYPE public identifier state
// 8.2.4.61 Between DOCTYPE public and system identifiers state

_$[DT_BETWEEN_PUB_SYS] = function(c){
	if(whitespace(c));
	else if(c === ">"){
		this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, null, true);
		this._nameBuffer = this._valueBuffer = null;
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else if(c === "\""){
		this._state = DT_SYSTEM_DQ;
		this._systemBuffer = "";
		this._sectionStart = this._index + 1;
	} else if(c === "'"){
		this._state = DT_SYSTEM_SQ;
		this._systemBuffer = "";
		this._sectionStart = this._index + 1;
	} else {
		this._state = BOGUS_EVIL_DOCTYPE;
	}
};

// 8.2.4.62 After DOCTYPE system keyword state
// Ignored 8.2.4.63 Before DOCTYPE system identifier state

_$[AFTER_DT_SYSTEM] = function(c){
	if(whitespace(c));
	else if(c === ">"){
		this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, this._systemBuffer, false);
		this._nameBuffer = this._valueBuffer = this._systemBuffer = null;
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else if(c === "\""){
		this._state = DT_SYSTEM_DQ;
		this._systemBuffer = "";
		this._sectionStart = this._index + 1;
	} else if(c === "'"){
		this._state = DT_SYSTEM_SQ;
		this._systemBuffer = "";
		this._sectionStart = this._index + 1;
	} else {
		this._state = BOGUS_EVIL_DOCTYPE;
	}
};

function doctypeSystemQuotedState(quot){
	return function(c){
		if(c === quot){
			this._systemBuffer += this._getEndingSection();
			this._state = AFTER_DT_SYSTEM_IDENT;
		} else if(c === ">"){
			// parse error
			this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, this._systemBuffer + this._getPartialSection(), false);
			this._nameBuffer = this._valueBuffer = this._systemBuffer = null;
			this._state = DATA;
		} else if(c === "\0"){
			this._systemBuffer += this._getPartialSection() + REPLACEMENT_CHARACTER;
		}
	};
}

// 8.2.4.64 DOCTYPE system identifier (double-quoted) state
// 8.2.4.65 DOCTYPE system identifier (single-quoted) state

_$[DT_SYSTEM_DQ] = doctypeSystemQuotedState("\"");
_$[DT_SYSTEM_SQ] = doctypeSystemQuotedState("'");

// 8.2.4.66 After DOCTYPE system identifier state

_$[AFTER_DT_SYSTEM_IDENT] = function(c){
	if(!whitespace(c)){
		this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, this._systemBuffer, true);
		this._nameBuffer = this._valueBuffer = this._systemBuffer = null;
		this._state = BOGUS_DOCTYPE;
		this._index--;
	}
};

//helper for sequences
_$[BOGUS_EVIL_DOCTYPE] = function(){
	this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, this._systemBuffer, false);
	this._nameBuffer = this._valueBuffer = this._systemBuffer = null;
	this._state = BOGUS_DOCTYPE;
	this._index--;
};

// 8.2.4.67 Bogus DOCTYPE state

_$[BOGUS_DOCTYPE] = function(c){
	if(c === ">"){
		this._sectionStart = this._index + 1;
		this._state = DATA;
	}
};

_$[BEFORE_CDATA] = function(c){
	if(c === "["){
		this._state = IN_CDATA;
		this._sectionStart = this._index + 1;
	} else {
		this._state = BOGUS_COMMENT;
		this._index--;
	}
};

_$[IN_CDATA] = characterState("]", AFTER_CDATA_1);
_$[AFTER_CDATA_1] = ifElseState("]", AFTER_CDATA_2, IN_CDATA);

_$[AFTER_CDATA_2] = function(c){
	if(c === ">"){
		//remove 2 trailing chars
		this._cbs.oncdata(this._buffer.substring(this._sectionStart, this._index - 2));
		this._sectionStart = this._index + 1;
		this._state = DATA;
	} else if (c !== "]") {
		this._state = IN_CDATA;
	}
	//else: stay in AFTER_CDATA_2 (`]]]>`)
};

_$[BEFORE_ENTITY] = function(c){
	if(c === "#"){
		this._state = BEFORE_NUMERIC_ENTITY;
	} else {
		this._state = IN_NAMED_ENTITY;
		this._index--;
	}
};

_$[BEFORE_NUMERIC_ENTITY] = function(c){
	if(c === "x" || c === "X"){
		this._state = IN_HEX_ENTITY;
	} else {
		this._state = IN_NUMERIC_ENTITY;
		this._index--;
	}
};

_$[IN_NAMED_ENTITY] = function(c){
	if(c === ";"){
		if(this._sectionStart + 1 !== this._index){
			this._parseNamedEntityStrict();

			if(this._sectionStart + 1 < this._index){
				if(!isAttributeState(this._baseState) && !this._xmlMode){
					this._parseLegacyEntity();
				}
			} else {
				this._sectionStart++;
			}
		}
		this._state = this._baseState;
	} else if((c < "a" || c > "z") && (c < "A" || c > "Z") && (c < "0" || c > "9")){
		if(this._xmlMode);
		else if(this._sectionStart + 1 === this._index);
		else if(isAttributeState(this._baseState)){
			if(c !== "="){
				this._parseNamedEntityStrict();
			}
		} else {
			this._parseLegacyEntity();
		}

		this._state = this._baseState;
		this._index--;
	}
};

_$[IN_NUMERIC_ENTITY] = function(c){
	if(c === ";"){
		if(this._sectionStart + 2 !== this._index){
			this._decodeNumericEntity(2, 10);
			this._sectionStart++;
		}
	} else if(c < "0" || c > "9"){
		if(this._xmlMode || this._sectionStart + 3 === this._index){
			this._state = this._baseState;
		} else {
			this._decodeNumericEntity(2, 10);
		}
		this._index--;
	}
};

_$[IN_HEX_ENTITY] = function(c){
	if(c === ";"){
		this._decodeNumericEntity(3, 16);
		this._sectionStart++;
	} else if((c < "a" || c > "f") && (c < "A" || c > "F") && (c < "0" || c > "9")){
		if(this._xmlMode || this._sectionStart + 3 === this._index){
			this._state = this._baseState;
		} else {
			this._decodeNumericEntity(3, 16);
		}
		this._index--;
	}
};

//for entities terminated with a semicolon
Tokenizer.prototype._parseNamedEntityStrict = function(){
	//offset = 1
	if(this._sectionStart + 1 < this._index){
		var entity = this._buffer.substring(this._sectionStart + 1, this._index),
			map = this._xmlMode ? xmlMap : entityMap;

		if(map.hasOwnProperty(entity)){
			this._emitPartial(map[entity]);
			this._sectionStart = this._index;
		}
	}
};


//parses legacy entities (without trailing semicolon)
Tokenizer.prototype._parseLegacyEntity = function(){
	var start = this._sectionStart + 1,
		limit = this._index - start;

	if(limit > 6) limit = 6; //the max length of legacy entities is 6

	while(limit >= 2){ //the min length of legacy entities is 2
		var entity = this._buffer.substr(start, limit);

		if(legacyMap.hasOwnProperty(entity)){
			this._emitPartial(legacyMap[entity]);
			this._sectionStart += limit + 1;
			return;
		} else {
			limit--;
		}
	}
};

Tokenizer.prototype._decodeNumericEntity = function(offset, base){
	var sectionStart = this._sectionStart + offset;

	if(sectionStart !== this._index){
		//parse entity
		var entity = this._buffer.substring(sectionStart, this._index);
		var parsed = parseInt(entity, base);

		this._emitPartial(decodeCodePoint(parsed));
		this._sectionStart = this._index;
	} else {
		if(base === 10){
			this._sectionStart -= 2;
		} else {
			this._sectionStart -= 3;
		}
	}

	this._state = this._baseState;
};

Tokenizer.prototype._cleanup = function () {
	if(this._sectionStart < 0){
		this._buffer = "";
		this._index = 0;
	} else if(this._running){
		if(
			this._state === DATA ||
			this._state === RCDATA_STATE ||
			this._state === RAWTEXT_STATE ||
			this._state === PLAINTEXT_STATE ||
			this._state === SCRIPT_DATA_STATE
		){
			if(this._sectionStart !== this._index){
				this._cbs.ontext(this._buffer.substr(this._sectionStart));
			}
			this._buffer = "";
			this._index = 0;
		} else if(this._sectionStart === this._index){
			//the section just started
			this._buffer = "";
			this._index = 0;
		} else {
			//remove everything unnecessary
			this._buffer = this._buffer.substr(this._sectionStart);
			this._index -= this._sectionStart;
		}

		this._sectionStart = 0;
	}
};

Tokenizer.prototype.write = function(chunk){
	if(this._ended) this._cbs.onerror(Error(".write() after done!"));

	this._buffer += chunk;
	this._parse();
};

Tokenizer.prototype._parse = function(){
	while(
		this._index < this._buffer.length && this._running
	){
		//TODO re-add giant branch tree
		this[this._state](this._buffer.charAt(this._index));
		this._index++;
	}

	this._cleanup();
};

Tokenizer.prototype.pause = function(){
	this._running = false;
};

Tokenizer.prototype.resume = function(){
	this._running = true;

	if(this._index < this._buffer.length){
		this._parse();
	}
	if(this._ended){
		this._finish();
	}
};

Tokenizer.prototype.end = function(chunk){
	if(this._ended) this._cbs.onerror(Error(".end() after done!"));
	if(chunk) this.write(chunk);

	this._ended = true;

	if(this._running) this._finish();
};

Tokenizer.prototype._finish = function(){
	//if there is remaining data, emit it in a reasonable way
	var data = this._buffer.substr(this._sectionStart);

	if(
		this._state === AFTER_DOCTYPE_NAME ||
		this._state === AFTER_DT_PUBLIC ||
		this._state === BOGUS_EVIL_DOCTYPE ||
		this._state === AFTER_DT_SYSTEM ||
		this._state === DT_BETWEEN_PUB_SYS ||
		this._state === AFTER_DT_SYSTEM_IDENT
	){
		this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, this._systemBuffer, false);
	} else if(this._state === DT_PUBLIC_DQ || this._state === DT_PUBLIC_SQ){
		this._cbs.ondoctype(this._nameBuffer, this._valueBuffer + data, this._systemBuffer, false);
	} else if(this._state === DT_SYSTEM_DQ || this._state === DT_SYSTEM_SQ){
		this._cbs.ondoctype(this._nameBuffer, this._valueBuffer, this._systemBuffer + data, false);
	} else if(this._state === BEFORE_DOCTYPE_NAME){
		this._cbs.ondoctype(null, null, null, false);
	} else if(this._state === DOCTYPE_NAME){
		this._cbs.ondoctype(this._nameBuffer + data, null, null, false);
	} else if(this._state === SEQUENCE){
		this._state = this._baseState;
		this._finish();
	} else if(
		this._state === MARKUP_DECLARATION_OPEN ||
		this._state === BEFORE_COMMENT ||
		this._state === COMMENT ||
		this._state === BOGUS_COMMENT ||
		this._state === COMMENT_START
	){
		this._cbs.oncomment(data);
	} else if(this._state === COMMENT_START_DASH || this._state === COMMENT_END_DASH){
		// parse error
		this._cbs.oncomment(data.slice(0, -1));
	} else if(this._state === COMMENT_END){
		// parse error
		this._cbs.oncomment(data.slice(0, -2));
	} else if(this._state === COMMENT_END_BANG){
		// parse error
		this._cbs.oncomment(data.slice(0, -3));
	} else if(data.length === 0){
		//we're done
	} else if(this._state === IN_CDATA || this._state === AFTER_CDATA_1 || this._state === AFTER_CDATA_2){
		this._cbs.oncdata(data);
	} else if(this._state === IN_NAMED_ENTITY && !this._xmlMode){
		this._parseLegacyEntity();
		if(this._sectionStart < this._index){
			this._state = this._baseState;
			this._finish();
		}
	} else if(this._state === IN_NUMERIC_ENTITY && !this._xmlMode){
		this._decodeNumericEntity(2, 10);
		if(this._sectionStart < this._index){
			this._state = this._baseState;
			this._finish();
		}
	} else if(this._state === IN_HEX_ENTITY && !this._xmlMode){
		this._decodeNumericEntity(3, 16);
		if(this._sectionStart < this._index){
			this._state = this._baseState;
			this._finish();
		}
	} else if(
		this._state !== TAG_NAME &&
		this._state !== AFTER_CLOSING_TAG_NAME &&
		this._state !== BEFORE_ATTRIBUTE_NAME &&
		this._state !== BEFORE_ATTRIBUTE_VALUE &&
		this._state !== AFTER_ATTRIBUTE_NAME &&
		this._state !== ATTRIBUTE_NAME &&
		this._state !== ATTRIBUTE_VALUE_SQ &&
		this._state !== ATTRIBUTE_VALUE_DQ &&
		this._state !== ATTRIBUTE_VALUE_NQ &&
		this._state !== IN_CLOSING_TAG_NAME &&
		this._state !== BOGUS_DOCTYPE
	){
		this._cbs.ontext(data);
	}
	//else, ignore remaining data
	//TODO add a way to remove current tag

	this._cbs.onend();
};

Tokenizer.prototype.reset = function(){
	Tokenizer.call(this, {xmlMode: this._xmlMode, decodeEntities: this._decodeEntities}, this._cbs);
};

Tokenizer.prototype._getSection = function(){
	return this._buffer.substring(this._sectionStart, this._index);
};

Tokenizer.prototype._getEndingSection = function(){
	var ret = this._getSection();
	this._sectionStart = -1;
	return ret;
};

Tokenizer.prototype._getPartialSection = function(){
	var ret = this._getSection();
	this._sectionStart = this._index + 1;
	return ret;
};

Tokenizer.prototype._emitPartial = function(value){
	if(isAttributeState(this._baseState)){
		this._valueBuffer += value;
	} else {
		this._cbs.ontext(value);
	}
};
