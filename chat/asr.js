/* 라온 받아쓰기 — 브라우저에서 도는 한국어 음성 인식 (직접 학습한 Conformer-CTC + 음절 n-gram 언어 모델)
 * 특징 추출(log-mel 80 + 발화별 정규화)과 자모 조합은 학습 코드(asr/common.py)와 똑같이 계산해야 함.
 * 디코딩(CTC 빔서치 + 언어 모델)은 asr/ctcdec.py, asr/lmref.py 와 같은 규칙.
 * 사용: RaonASR.transcribe(Float32Array 16kHz 모노) -> Promise<string>
 */
(function(){
  var SR=16000,WIN=400,HOP=160,NFFT=512,NMEL=80,FMIN=20,FMAX=7600,NB=NFFT/2+1;
  var ORT_VER="1.30.0";
  var ORT_URL="https://cdn.jsdelivr.net/npm/onnxruntime-web@"+ORT_VER+"/dist/ort.min.js";
  var BASE=document.currentScript?document.currentScript.src:location.href;
  var MODEL_URL=new URL("models/asr-ko.onnx",BASE).href;
  var LM_URL=new URL("models/lm-ko.bin",BASE).href;
  // 디코딩 설정 (fl_dev 기준으로 고른 값)
  var LM_ALPHA=0.5,LM_BETA=1.0,BEAM=16,TOPK=6,PMIN=-9.0,UNK_PEN=-10.0;

  function hz2mel(f){return 2595*Math.log10(1+f/700)}
  function mel2hz(m){return 700*(Math.pow(10,m/2595)-1)}
  var MEL=(function(){
    var lo=hz2mel(FMIN),hi=hz2mel(FMAX),hz=[],fb=[];
    for(var i=0;i<NMEL+2;i++)hz.push(mel2hz(lo+(hi-lo)*i/(NMEL+1)));
    for(i=0;i<NMEL;i++){
      var row=new Float32Array(NB),l=hz[i],c=hz[i+1],r=hz[i+2];
      for(var k=0;k<NB;k++){var f=k*SR/NFFT;row[k]=Math.max(0,Math.min((f-l)/(c-l),(r-f)/(r-c)))}
      fb.push(row);
    }
    return fb;
  })();
  var WINDOW=new Float32Array(WIN);for(var i=0;i<WIN;i++)WINDOW[i]=0.5-0.5*Math.cos(2*Math.PI*i/WIN);
  var REV=new Uint16Array(NFFT),COS=new Float64Array(NFFT/2),SIN=new Float64Array(NFFT/2);
  (function(){var bits=Math.log2(NFFT);for(var i=0;i<NFFT;i++){var r=0;for(var b=0;b<bits;b++)r|=((i>>b)&1)<<(bits-1-b);REV[i]=r}
    for(i=0;i<NFFT/2;i++){COS[i]=Math.cos(2*Math.PI*i/NFFT);SIN[i]=-Math.sin(2*Math.PI*i/NFFT)}})();
  function fft(re,im){
    for(var i=0;i<NFFT;i++){var j=REV[i];if(j>i){var t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
    for(var size=2;size<=NFFT;size<<=1){
      var half=size>>1,step=NFFT/size;
      for(var s=0;s<NFFT;s+=size)for(var k=0;k<half;k++){
        var a=s+k,b=a+half,wr=COS[k*step],wi=SIN[k*step];
        var xr=re[b]*wr-im[b]*wi,xi=re[b]*wi+im[b]*wr;
        re[b]=re[a]-xr;im[b]=im[a]-xi;re[a]+=xr;im[a]+=xi;
      }
    }
  }
  function logmel(x){
    if(x.length<WIN){var y=new Float32Array(WIN);y.set(x);x=y}
    var T=1+Math.floor((x.length-WIN)/HOP),out=new Float32Array(T*NMEL);
    var re=new Float64Array(NFFT),im=new Float64Array(NFFT),pw=new Float64Array(NB);
    for(var t=0;t<T;t++){
      re.fill(0);im.fill(0);
      for(var i=0;i<WIN;i++)re[i]=x[t*HOP+i]*WINDOW[i];
      fft(re,im);
      for(var k=0;k<NB;k++)pw[k]=re[k]*re[k]+im[k]*im[k];
      for(var m=0;m<NMEL;m++){var s=0,row=MEL[m];for(k=0;k<NB;k++)s+=pw[k]*row[k];out[t*NMEL+m]=Math.log(Math.max(s,1e-10))}
    }
    for(m=0;m<NMEL;m++){      // 발화별 평균·분산 정규화
      var mu=0,v=0;for(t=0;t<T;t++)mu+=out[t*NMEL+m];mu/=T;
      for(t=0;t<T;t++){var d=out[t*NMEL+m]-mu;v+=d*d}var sd=Math.sqrt(v/T)+1e-5;
      for(t=0;t<T;t++)out[t*NMEL+m]=(out[t*NMEL+m]-mu)/sd;
    }
    return {data:out,T:T};
  }

  // 자모 토큰: 0 blank, 1 띄어쓰기, 2..20 초성, 21..41 중성, 42..68 종성(1..27)
  var CHO0=2,JUNG0=21,JONG0=41,NJUNG=21;
  function isVowel(t){return t>=JUNG0&&t<JUNG0+NJUNG}
  function jamoDecode(ids){
    var s="",cho=-1,jung=-1;
    function flush(jong){if(cho>=0&&jung>=0)s+=String.fromCharCode(0xAC00+cho*588+jung*28+(jong||0));cho=-1;jung=-1}
    ids.forEach(function(t){
      if(t===1){flush();s+=" "}
      else if(t>=CHO0&&t<JUNG0){flush();cho=t-CHO0}
      else if(isVowel(t)){if(cho<0)cho=11;if(jung>=0){flush();cho=11}jung=t-JUNG0}
      else if(t>JONG0){if(jung>=0)flush(t-JONG0)}
    });
    flush();
    return s.replace(/\s+/g," ").trim();
  }

  /* ---------- 음절 n-gram 언어 모델 (RLM1 바이너리, asr/lm_build.py 형식) ---------- */
  function LM(buf){
    var u8=new Uint8Array(buf),dv=new DataView(buf);
    if(String.fromCharCode(u8[0],u8[1],u8[2],u8[3])!=="RLM1")throw new Error("LM 형식 오류");
    this.N=u8[4];this.V=dv.getUint16(5,true);var nsyl=dv.getUint16(7,true);
    var p=9,i;
    this.sid=new Map();
    for(i=0;i<nsyl;i++){this.sid.set(String.fromCharCode(dv.getUint16(p,true)),3+i);p+=2}
    this.prob={};this.bow={};this.off={};this.word={};
    this.prob[1]=u8.subarray(p,p+this.V);p+=this.V;
    this.bow[1]=u8.subarray(p,p+this.V);p+=this.V;
    this.off[1]=new Uint32Array(buf.slice(p,p+4*(this.V+1)));p+=4*(this.V+1);
    for(var n=2;n<=this.N;n++){
      var cnt=dv.getUint32(p,true);p+=4;
      this.word[n]=new Uint16Array(buf.slice(p,p+2*cnt));p+=2*cnt;
      this.prob[n]=u8.subarray(p,p+cnt);p+=cnt;
      if(n<this.N){
        this.bow[n]=u8.subarray(p,p+cnt);p+=cnt;
        this.off[n]=new Uint32Array(buf.slice(p,p+4*(cnt+1)));p+=4*(cnt+1);
      }
    }
    this.cache=new Map();
  }
  // 토큰 목록(처음은 유니그램 id)을 따라 내려가 노드 번호 찾기. 없으면 -1
  LM.prototype._node=function(toks){
    var idx=toks[0];
    for(var k=1;k<toks.length;k++){
      if(k+1>this.N)return -1;
      var n=k+1,off=this.off[n-1],ws=this.word[n];
      var lo=off[idx],hi=off[idx+1],w=toks[k],a=lo,b=hi-1,f=-1;
      while(a<=b){var mid=(a+b)>>1,x=ws[mid];if(x===w){f=mid;break}if(x<w)a=mid+1;else b=mid-1}
      if(f<0)return -1;
      idx=f;
    }
    return idx;
  };
  // ln p(w | hist) — 백오프 방식. hist는 마지막 N-1개만 본다.
  LM.prototype.logp=function(hist,w){
    hist=hist.slice(-(this.N-1));
    var key=hist.join(",")+"|"+w,c=this.cache.get(key);
    if(c!==undefined)return c;
    var total=0,res=null;
    for(var start=0;start<=hist.length&&res===null;start++){
      var ctx=hist.slice(start),nd=this._node(ctx.concat([w]));
      if(nd>=0){res=total-this.prob[ctx.length+1][nd]/16;break}
      if(ctx.length){var nc=this._node(ctx);if(nc>=0&&ctx.length<this.N)total-=this.bow[ctx.length][nc]/16}
    }
    if(res===null)res=total;
    this.cache.set(key,res);
    return res;
  };
  // 자모 토큰 → 음절 어휘 id (없는 글자는 -1)
  LM.prototype.syllableId=function(ch){var v=this.sid.get(ch);return v===undefined?-1:v};

  /* ---------- CTC 빔서치 + 언어 모델 (asr/ctcdec.py 와 같은 규칙) ---------- */
  var BOS=0,EOS=1,SPC=2,NEG=-1e30;
  function lae(a,b){if(a<=NEG)return b;if(b<=NEG)return a;var m=a>b?a:b;return m+Math.log(Math.exp(a-m)+Math.exp(b-m))}

  function complete(lm,st){
    if(!st.pending.length)return st;
    var ch=jamoDecode(st.pending),sid=ch.length===1?lm.syllableId(ch):-1;
    if(sid<0)return {lm:st.lm+UNK_PEN,units:[BOS],pending:[],nsyl:st.nsyl+1};
    return {lm:st.lm+lm.logp(st.units,sid),units:st.units.concat([sid]).slice(-3),pending:[],nsyl:st.nsyl+1};
  }
  function advance(lm,st,t){
    if(t===1){
      st=complete(lm,st);
      var lmv=st.lm,units=st.units;
      if(units.length&&units[units.length-1]!==SPC){lmv+=lm.logp(units,SPC);units=units.concat([SPC]).slice(-3)}
      return {lm:lmv,units:units,pending:[],nsyl:st.nsyl};
    }
    if(t>=CHO0&&t<JUNG0){st=complete(lm,st);return {lm:st.lm,units:st.units,pending:[t],nsyl:st.nsyl}}
    if(isVowel(t)){
      if(st.pending.some(isVowel)){st=complete(lm,st)}
      var pend=st.pending.length?st.pending:[13];
      return {lm:st.lm,units:st.units,pending:pend.concat([t]),nsyl:st.nsyl};
    }
    if(t>JONG0){
      if(st.pending.length===2&&isVowel(st.pending[1]))return {lm:st.lm,units:st.units,pending:st.pending.concat([t]),nsyl:st.nsyl};
      return st;
    }
    return st;
  }
  function finalLM(lm,st){
    st=complete(lm,st);
    var units=st.units;
    if(units.length&&units[units.length-1]===SPC){units=units.slice(0,-1);if(!units.length)units=[BOS]}
    return {lm:st.lm+lm.logp(units,EOS),nsyl:st.nsyl};
  }
  // lp: Float32Array (T*V) 로그확률
  function beamDecode(lm,lp,T,V){
    var alpha=LM_ALPHA,beta=LM_BETA;
    function score(e){return lae(e.pb,e.pnb)+alpha*e.st.lm+beta*e.st.nsyl}
    var beams=new Map();
    beams.set("",{pre:[],pb:0,pnb:NEG,st:{lm:0,units:[BOS],pending:[],nsyl:0}});
    for(var t=0;t<T;t++){
      var o=t*V;
      if(lp[o]>-0.0005&&t>0){       // 거의 확실한 공백 프레임
        beams.forEach(function(e){e.pb=lae(e.pb,e.pnb)+lp[o];e.pnb=NEG});
        continue;
      }
      var order=[];for(var v=1;v<V;v++)order.push(v);
      order.sort(function(x,y){return lp[o+y]-lp[o+x]});
      var cands=order.slice(0,TOPK+1).filter(function(c){return lp[o+c]>PMIN}).slice(0,TOPK);
      var nw=new Map();
      function slot(key,pre,st){var s=nw.get(key);if(!s){s={pre:pre,pb:NEG,pnb:NEG,st:st};nw.set(key,s)}return s}
      beams.forEach(function(e,key){
        var ptot=lae(e.pb,e.pnb),s=slot(key,e.pre,e.st);
        s.pb=lae(s.pb,ptot+lp[o]);
        var last=e.pre.length?e.pre[e.pre.length-1]:-1;
        if(last>0)s.pnb=lae(s.pnb,e.pnb+lp[o+last]);
        cands.forEach(function(c){
          if(c===1&&!e.pre.length)return;
          var ext=e.pre.concat([c]),ek=ext.join(","),x=nw.get(ek);
          if(!x){x=slot(ek,ext,advance(lm,e.st,c))}
          x.pnb=lae(x.pnb,(c===last?e.pb:ptot)+lp[o+c]);
        });
      });
      var arr=[];nw.forEach(function(e){arr.push(e)});
      arr.sort(function(a,b){return score(b)-score(a)});
      beams=new Map();
      arr.slice(0,BEAM).forEach(function(e){beams.set(e.pre.join(","),e)});
    }
    var best=null,bs=NEG;
    beams.forEach(function(e){
      var f=finalLM(lm,e.st),s=lae(e.pb,e.pnb)+alpha*f.lm+beta*f.nsyl;
      if(best===null||s>bs){best=e.pre;bs=s}
    });
    return jamoDecode(best||[]);
  }

  /* ---------- 모델 로드·추론 ---------- */
  var sess=null,lmP=null,lmObj=null;
  function loadScript(u){return new Promise(function(ok,no){var s=document.createElement("script");s.src=u;s.onload=ok;s.onerror=function(){no(new Error("스크립트 로드 실패"))};document.head.appendChild(s)})}
  function load(){
    if(!sess)sess=(window.ort?Promise.resolve():loadScript(ORT_URL)).then(function(){
      ort.env.wasm.wasmPaths="https://cdn.jsdelivr.net/npm/onnxruntime-web@"+ORT_VER+"/dist/";
      return ort.InferenceSession.create(MODEL_URL,{executionProviders:["wasm"]});
    }).catch(function(e){sess=null;throw e});
    return sess;
  }
  // 언어 모델은 실패해도 받아쓰기는 그리디로 돌아가게 따로 로드
  function loadLM(){
    if(!lmP)lmP=fetch(LM_URL).then(function(r){if(!r.ok)throw new Error("LM "+r.status);return r.arrayBuffer()})
      .then(function(b){lmObj=new LM(b);return lmObj}).catch(function(e){lmP=null;return null});
    return lmP;
  }
  function logSoftmaxRows(d,T,V){
    var out=new Float32Array(T*V);
    for(var t=0;t<T;t++){
      var o=t*V,mx=-1e30,i;
      for(i=0;i<V;i++)if(d[o+i]>mx)mx=d[o+i];
      var s=0;for(i=0;i<V;i++)s+=Math.exp(d[o+i]-mx);
      var lse=mx+Math.log(s);
      for(i=0;i<V;i++)out[o+i]=d[o+i]-lse;
    }
    return out;
  }
  function transcribe(pcm16k){
    return Promise.all([load(),loadLM()]).then(function(res){
      var s=res[0],lm=res[1];
      var f=logmel(pcm16k);
      var feeds={};feeds[s.inputNames[0]]=new ort.Tensor("float32",f.data,[1,f.T,NMEL]);
      return s.run(feeds).then(function(r){
        var lg=r[s.outputNames[0]],T=lg.dims[1],V=lg.dims[2];
        if(lm){
          return beamDecode(lm,logSoftmaxRows(lg.data,T,V),T,V);
        }
        var ids=[],prev=-1;
        for(var t=0;t<T;t++){var best=0,bv=-1e30;for(var v=0;v<V;v++){var x=lg.data[t*V+v];if(x>bv){bv=x;best=v}}
          if(best!==prev&&best!==0)ids.push(best);prev=best}
        return jamoDecode(ids);
      });
    });
  }
  window.RaonASR={transcribe:transcribe,load:load,loadLM:loadLM,logmel:logmel,decode:jamoDecode,
    _LM:LM,_beamDecode:beamDecode};
})();
