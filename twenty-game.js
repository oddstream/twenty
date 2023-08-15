var MINI = require('minified');
var _=MINI._, $=MINI.$, $$=MINI.$$, EE=MINI.EE, HTML=MINI.HTML;

var readyCount=0;
function addReady() {
	readyCount++;
	return function() {
		if (--readyCount==0) {
			startGame();
		}
	}
}

function loadImage(url) {
	var img=EE('img',{'@src':url});
	img.on('load', addReady());
	return img[0];
}

window.onload=addReady();
Module.onRuntimeInitialized=addReady();

function startAnimation(f) {
	if (window.requestAnimationFrame) {
		function wrapper(t) {
			window.requestAnimationFrame(wrapper);
			f(t);
		}
		window.requestAnimationFrame(wrapper);
	} else {
		window.setInterval(function() {
			f(new Date().getTime());
		}, 1000/60)
	}
}

var tutorialText=[
	"Welcome to Twenty!<br>" +
		"<span class='tutorial-small'>(best played with touch, but works with a mouse)</span><br><br>" +
		"To play, pick up tiles and drop them<br>onto tiles with the same value." +
	"<br><br><span class='tutorial-small'>(<a href='#' onclick='restart();return false;'>Skip Tutorial</a>)</span>",
	"Matching tiles will combine to<br>create a tile with a new value.",
	"Sometimes you will have to move<br>another tile out of the way to reach<br>a matching tile.",
	"Great! Keep going...",
	"You get a new row when you run<br>out of moves.",
	".... or when the timer runs out!",
	"Your score is the highest value tile<br>on the board.<br><br>Now try to get to 20!"
];

var gfx={
	links:[loadImage("gfx/link_ud.png"),loadImage("gfx/link_lr.png")],
	pieces: loadImage("gfx/pieces.png?n=1"),
	particles: loadImage("gfx/particles.png"),
	corners: loadImage("gfx/corners.png")
};

var kPieceImageWidth=80;
var kPieceImageHeight=80;
var kPieceDrawWidth=kPieceImageWidth;
var kPieceDrawHeight=kPieceImageHeight+4;

var kBoardDrawWidth=kPieceDrawWidth*7;
var kBoardDrawHeight=kPieceDrawHeight*8;

var kInsidePadding=5;

var kScoreScale=0.5;

var canvas;
var kCanvasWidth=kBoardDrawWidth+kInsidePadding*2;
var kCanvasHeight=kBoardDrawHeight+kInsidePadding*2;

var inputMethod='mouse';
function touchDetected() {
	inputMethod='touch';
	//b.setTouch(true);
}

var audioCtor=window.AudioContext || window.webkitAudioContext;
var audioCtx=audioCtor ? new audioCtor() : null;
function loadSound(url) {
	var ret={};
	var req=new XMLHttpRequest();
	req.onload=function() {
		audioCtx.decodeAudioData(req.response,function(buf){
			ret.buffer=buf;
		})
	}
	req.open('GET',url,true);
	req.responseType='arraybuffer';
	req.send();
	return ret;
}

function playSound(snd) {
	if (!snd.buffer) return;

	var src=audioCtx.createBufferSource();
	src.buffer=snd.buffer;
	src.connect(audioCtx.destination);
	src.start(0);
}

function el(elid) {
	return document.getElementById(elid);
}

function elRect(el) {
	var l=el.offsetLeft,t=el.offsetTop;
	var w=el.offsetWidth,h=el.offsetHeight;
	el=el.offsetParent;
	while(el) {
		l+=el.offsetLeft;
		t+=el.offsetTop;
		el=el.offsetParent;
	}
	return {left:l, top:t, right:l+w, bottom:t+h, width:w, height:h};
}


function pointToBoard(pos) {
	return {x:(pos.x-kInsidePadding)*1400/kBoardDrawWidth|0,
		y:(kCanvasHeight-kInsidePadding-pos.y)*1600/kBoardDrawHeight|0};
}

function pointToView(pos) {
	return {x:(pos.x*kBoardDrawWidth/1400|0)+kInsidePadding,
		y:(kCanvasHeight-(pos.y*kBoardDrawHeight/1600|0))-kInsidePadding};
}

function drawImage(img,pos) {
	canvas.drawImage(img, pos.x-img.width/4 |0, pos.y-img.height/4 |0,
		img.width/2 |0, img.height/2 |0);
}

var coinPool=[];
function makeCoin() {
	if (coinPool.length > 0) {
		return coinPool.splice(0,1)[0];
	}

	var coinEl=document.createElement("div");
	coinEl.className="coin-wrapper";
	coinEl.style.position="absolute";

	var img=document.createElement("img");
	img.src="gfx/pieces.png?n=1";
	img.className="coin-image";
	coinEl.appendChild(img);
	document.body.appendChild(coinEl);

	return coinEl;
}

function updateCoin(coinEl,val,pos,scale) {
    var col=(val-1)/5|0;
    var row=(val-1)%5;

	var colWidth=kPieceImageWidth*scale|0;
	var rowHeight=kPieceImageHeight*scale|0;

	if (pos) {
		coinEl.style.left=(pos.x-colWidth/2) + "px";
		coinEl.style.top=(pos.y-rowHeight/2) + "px";
	}
	coinEl.style.width = colWidth+"px";
	coinEl.style.height = rowHeight+"px";

	var imgEl = coinEl.firstChild;
	imgEl.style.width = (colWidth*4) + "px";
	imgEl.style.left = (-col*colWidth) + "px";
	imgEl.style.top = (-row*rowHeight) + "px";
}

function deleteCoin(coinEl) {
	updateCoin(coinEl,0,{x:0,y:0}, 1.0);
	coinPool.push(coinEl);
}

function setDisplayedScore(scoreEl,score,scale) {
	var coinVal = score > 20 ? 20 : score;
	updateCoin($(".score-coin", scoreEl)[0], coinVal, null, scale);
	$(".score-multiplier", scoreEl)[0].innerHTML = (score<=20) ? "&nbsp;" : "x" + (score-19);
}

function describeScore(score) {
	var desc = score > 20 ? "20" : ""+score;
	return (score<=20) ? (""+score) : "20x" + (score-19);
}

function easeInOut(t) {
	if (t<0.5) {
		return t*t*2;
	} else {
		return 1-(1-t)*(1-t)*2;
	}
}

function interpolate(from,to,t) {
	return from+(to-from)*t;
}

var incoming=[];

function stepIncoming() {
	for(var i=0; i<incoming.length; i) {
		var c=incoming[i];
		c.t++;
		if (c.t>=c.limit) {
			deleteCoin(c.el);
			incoming.splice(i,1);
		} else {
			var t=easeInOut(c.t/c.limit);
			updateCoin(c.el,20,{
				x:interpolate(c.from.x,c.to.x,t),
				y:interpolate(c.from.y,c.to.y,t)
			}, interpolate(c.from.scale,c.to.scale,t));
			i++;
		}
	}
}

function newIncoming(from,to) {
	var dx=from.x-to.x;
	var dy=from.y-to.y;
	var dist = Math.sqrt(dx*dx+dy*dy);
	incoming.push({
		from:from, to:to, t:0, limit:dist/10, el: makeCoin()
	})
}

var b;
var tutorial=null;
var effects;
var canvasEl;
var tutorialIdx=-1;
var tutorialEl=null;
var curtainEl=null;
function setCurtain(f) {
	if (f) {
		var rc=elRect(canvasEl);
		if (!curtainEl) {
			curtainEl = $("#curtain");
			curtainEl.set({$left:rc.left+"px", $width:rc.width+"px",
						$top:(-rc.height)+"px", $height:rc.height+"px",
						$$fade:0});
			curtainEl.show();
			curtainEl.animate({$$fade:1, $top:rc.top+"px"});
		}
		curtainEl.set({$left:rc.left+"px"});

	} else if (curtainEl) {
		curtainEl.hide();
		curtainEl = null;
	}
}

function restartTutorial() {

	b=Module.newTutorialBoard();
	tutorial=new Module.TutorialController(b);
	b.step();
	tutorial.afterStep();
	effects=new Module.BoardEffects(b);
	effects.afterStep();
}

function restart() {
	b=Module.newRegularBoard();
	b.step();
	tutorial=null;
	effects=new Module.BoardEffects(b);
	effects.afterStep();
}

function makeShareButtons(text) {
	var lnk=document.createElement("a");
	lnk.href="https://twitter.com/share";
	lnk.className="twitter-share-button";
	$(lnk).set("%count", "none").set("%hashtags","canyougettotwenty").
		set("%text",text).
		set("%url","http://twenty.frenchguys.net");
		//		set("%size", "large").


	$("#final-share-links").fill().add(lnk);
	twttr.widgets.load();
}

function startGame() {
	canvasEl=el("board");
	canvasEl.height = kCanvasHeight;
	canvasEl.width = kCanvasWidth;
	el("play-area").style.width = kCanvasWidth + "px";
	canvas=canvasEl.getContext("2d");

	// preload some coin images
	var c1=makeCoin();
	var c2=makeCoin();
	deleteCoin(c1);
	deleteCoin(c2);

	// sounds
	var snd_Combo=[
		loadSound("sound/combo_20_1.wav"),
		loadSound("sound/combo_20_2.wav"),
		loadSound("sound/combo_20_3.wav"),
		loadSound("sound/combo_20_4.wav")
	];
	var snd_LevelUp=[
		loadSound("sound/levelup_20_1.wav"),
		loadSound("sound/levelup_20_2.wav"),
		loadSound("sound/levelup_20_3.wav")
	];
	var snd_Drop=loadSound("sound/drop2.wav");
	var snd_GameOver=loadSound("sound/gameover.wav");

	var activeTouch = null;

	function drawCoin(val,pos,scale) {
		scale=scale||1.0;
	    var col=(val-1)/5|0;
	    var row=(val-1)%5;
		var colWidth=kPieceImageWidth*scale|0;
		var rowHeight=kPieceImageHeight*scale|0;

		canvas.drawImage(gfx.pieces, col*kPieceImageWidth, row*kPieceImageHeight, kPieceImageWidth, kPieceImageHeight,
			pos.x-colWidth/2|0, pos.y-colWidth/2|0, colWidth, rowHeight);
	}

	function drawParticles(frame, pos) {
		var x=150*(frame%6);
		var y=150*((frame/6)|0);
		canvas.drawImage(gfx.particles,x,y,150,150,
			pos.x-75, pos.y-37, 150, 150);
	}

	var particles = [];

	Module.srand(new Date().getTime() & 0x7fffffff);

	restartTutorial();

	var warmup=true;

	function touchDown(fingerId, pos) {
		if (warmup) {
			// activate sound output on iOS
			warmup=false;
			playSound(snd_Drop);
		}

		if (activeTouch) {
			b.release();
			activeTouch = null;
		}
		pos=pointToBoard(pos);
		var piece = b.hitTest(pos);
		if (piece) {
			activeTouch = fingerId;
			b.grab(piece);
			b.setTarget(pos);
		}
	}
	function touchMove(fingerId, pos) {
		if (!activeTouch) return;
		if (fingerId == activeTouch) {
			b.setTarget(pointToBoard(pos));
		}
	}
	function touchUp(fingerId) {
		if (activeTouch==fingerId) {
			b.release();
			activeTouch=null;
		}
	}

	function eventPos(e) {
		var rc=canvasEl.getBoundingClientRect();
		return {x:(e.clientX-rc.left)*canvasEl.width/(rc.right-rc.left),
				y:(e.clientY-rc.top)*canvasEl.height/(rc.bottom-rc.top)};
	}

	canvasEl.addEventListener('touchstart', function(e) {
		touchDetected();
		e.preventDefault();
		var t=e.changedTouches[0];
		touchDown("t"+t.identifier, eventPos(t));
	})
	canvasEl.addEventListener('touchmove', function(e) {
		e.preventDefault();
		for(var i=0; i<e.changedTouches.length; i++) {
			var t=e.changedTouches[i];
			touchMove("t"+t.identifier, eventPos(t));
		}
	})
	canvasEl.addEventListener('touchend', function(e) {
		e.preventDefault();
		for(var i=0; i<e.changedTouches.length; i++) {
			var t=e.changedTouches[i];
			touchUp("t"+t.identifier);
		}
	})

	var mouseButton=false;
	window.addEventListener('mousedown', function(e) {
		e.preventDefault();
		if (e.button==0) {
			mouseButton=true;
			touchDown("m1",eventPos(e));
		}
	})
	window.addEventListener('mousemove', function(e) {
		if (mouseButton) {
			touchMove("m1",eventPos(e));
		}
	})
	window.addEventListener('mouseup', function(e) {
		if (e.button==0 && mouseButton) {
			mouseButton=false;
			touchUp("m1");
		}
	})
	window.addEventListener('MSPointerDown',function(e) {
		if (e.pointerType!='mouse') { touchDetected(); }
	})
	window.addEventListener('pointerdown',function(e) {
		if (e.pointerType!='mouse') { touchDetected(); }
	})

	var frames=0;
	var lastTime=0.0;
	startAnimation(function(time) {

		if (lastTime>0.0) {
			setCurtain(b.isGameOver());
			if (b.isGameOver())
				return;
		}

		var steps=((time-lastTime)/(1000/60)+0.1)|0;
		if (steps == 0) {
			return;
		}
		lastTime=time;
		if (steps > 20) {
			return;
		}

		el("timer-bar").style.width=(100*b.timeUntilNextDrop)+"%";
		setDisplayedScore(el("title-score"),b.score-incoming.length, kScoreScale);

		canvas.fillStyle = "#e0e0e0";
		canvas.fillRect(0, 0, kCanvasWidth, kCanvasHeight);

		// draw pieces
		for(var iter=b.pieces(); iter.next(); ) {
			var p = iter.current();
			var pos = pointToView(b.pieceDrawPos(p));
			drawCoin(p.value, pos, effects.scaleForPiece(p.value));
		}

		// links over coins
		for(var iter=b.pieces(); iter.next(); ) {
			var p = iter.current();
			for(var i=0; i<2; i++) {
	            var p2 = p.getLink(i);
	            if (p2) {
	            	var pos = pointToView(b.pieceDrawPos(p));
	            	if (i==0) {
	            		drawImage(gfx.links[i], {x:pos.x,y:pos.y-kPieceDrawHeight*0.51|0});
	            	} else {
	            		drawImage(gfx.links[i], {x:pos.x+kPieceDrawWidth/2,y:pos.y});
	            	}
	            }
			}
		}

		// draw particles
		for(var i=0; i<particles.length;i++) {
			var p=particles[i];
			drawParticles(p.t|0, p);
		}

		// draw corners:
		var r=20;
		canvas.drawImage(gfx.corners, 0, 0, r, r, 0, 0, r, r);
		canvas.drawImage(gfx.corners, 2*r, 0, r, r, canvasEl.width-r, 0, r, r);
		canvas.drawImage(gfx.corners, 0, 2*r, r, r, 0, canvasEl.height-r, r, r);
		canvas.drawImage(gfx.corners, 2*r, 2*r, r, r, canvasEl.width-r, canvasEl.height-r, r, r);

		// trigger sound effects:
		if (effects.hasDropped()) {
			playSound(snd_Drop);
		}
		if (effects.lastLevelUp() > -1) {
			playSound(snd_LevelUp[effects.lastLevelUp()]);
		}
		else if (effects.lastComboLevel() > -1) {
			playSound(snd_Combo[effects.lastComboLevel()]);
		}
		effects.clearStatus();

		// update tutorial text
		var newTuteIdx=(tutorial && !tutorial.isFinished()) ? tutorial.currentStage() : -1;
		if (newTuteIdx != tutorialIdx) {
			if (tutorialEl) {
				tutorialEl.animate({$$fade:0,$top:"100px"}).then(function(el) {
					el.remove();
				});
				tutorialEl=null;
			}
			if (newTuteIdx >= 0) {
				tutorialEl=EE('div', {className:"tutorial-text"},HTML(tutorialText[newTuteIdx]));
				$("#play-area").add(tutorialEl);
				tutorialEl.set({$$fade:0,$top:"300px"}).animate({$$fade:1,$top:"200px"});
			}

			tutorialIdx=newTuteIdx;
		}

		for(var frm=0;frm<steps;frm++) {
        	b.step();
        	tutorial && tutorial.afterStep();
        	effects.afterStep();
        	while(effects.hasClearedPiece()) {
        		var canvasRc=elRect(canvasEl);
        		var from=pointToView(effects.nextClearedPiecePos());
        		var boardScale=(canvasRc.bottom-canvasRc.top)/kCanvasHeight;
        		from={x:from.x*boardScale+canvasRc.left,
        			y:from.y*boardScale+canvasRc.top,
        			scale:boardScale };
        		var rc=elRect($("#title-score .score-coin")[0]);
        		var to={x:(rc.left+rc.right)/2, y:(rc.top+rc.bottom)/2,
        			scale:kScoreScale};
        		newIncoming(from,to);
        	}
        	stepIncoming();

			// step particles
			var newParticles=b.particles();
			for(var i=0; i<newParticles.length(); i++) {
				var p=newParticles.get(i);
				var newParticle=pointToView(p);
				newParticle.t=0;
				particles.push(newParticle);
			}
			newParticles.clear();
			for(var i=0; i<particles.length;) {
				var p=particles[i];
				p.t += 0.5;
				if (p.t >= 18) {
					particles.splice(i,1);
				} else {
					i++;
				}
			}
		}

		if (b.isGameOver()) {
			ga('set','dimension1',inputMethod);
			ga('send','event','game','complete','score',b.score);
			setDisplayedScore(el("final-score"), b.score, 0.75);
			makeShareButtons("I got to " + describeScore(b.score) + " playing Twenty, an addictive game of numbers that's harder than it looks!");
			playSound(snd_GameOver);
		}

	});
}