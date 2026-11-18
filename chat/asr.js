/* 라온 받아쓰기 — 브라우저에서 도는 한국어 음성 인식 (직접 학습한 Conformer-CTC)
 * 특징 추출(log-mel 80 + 발화별 정규화)은 학습 코드(asr/common.py)와 똑같이 계산해야 함.
 * 사용: RaonASR.transcribe(Float32Array 16kHz 모노) -> Promise<string>
 */
(function(){
  var SR=16000,WIN=400,HOP=160,NFFT=512,NMEL=80,FMIN=20,FMAX=7600,NB=NFFT/2+1;
  var ORT_URL="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.min.js";
  var MODEL_URL=new URL("models/asr-ko.onnx",document.currentScript?document.currentScript.src:location.href).href;

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
  // radix-2 FFT (in-place, re/im)
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
  var CHO0=2,JUNG0=21,JONG0=41;
  function decode(ids){
    var s="",cho=-1,jung=-1;
    function flush(jong){if(cho>=0&&jung>=0)s+=String.fromCharCode(0xAC00+cho*588+jung*28+(jong||0));cho=-1;jung=-1}
    ids.forEach(function(t){
      if(t===1){flush();s+=" "}
      else if(t>=CHO0&&t<JUNG0){flush();cho=t-CHO0}
      else if(t>=JUNG0&&t<JUNG0+21){if(cho<0)cho=11;if(jung>=0){flush();cho=11}jung=t-JUNG0}
      else if(t>JONG0){if(jung>=0)flush(t-JONG0)}
    });
    flush();
    return s.replace(/\s+/g," ").trim();
  }
  var sess=null;
  function loadScript(u){return new Promise(function(ok,no){var s=document.createElement("script");s.src=u;s.onload=ok;s.onerror=function(){no(new Error("스크립트 로드 실패"))};document.head.appendChild(s)})}
  function load(){
    if(!sess)sess=(window.ort?Promise.resolve():loadScript(ORT_URL)).then(function(){
      ort.env.wasm.wasmPaths="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/";
      return ort.InferenceSession.create(MODEL_URL,{executionProviders:["wasm"]});
    }).catch(function(e){sess=null;throw e});
    return sess;
  }
  function transcribe(pcm16k){
    return load().then(function(s){
      var f=logmel(pcm16k);
      var feeds={};feeds[s.inputNames[0]]=new ort.Tensor("float32",f.data,[1,f.T,NMEL]);
      return s.run(feeds).then(function(r){
        var lg=r[s.outputNames[0]],T=lg.dims[1],V=lg.dims[2],d=lg.data,ids=[],prev=-1;
        for(var t=0;t<T;t++){var best=0,bv=-1e30;for(var v=0;v<V;v++){var x=d[t*V+v];if(x>bv){bv=x;best=v}}
          if(best!==prev&&best!==0)ids.push(best);prev=best}
        return decode(ids);
      });
    });
  }
  window.RaonASR={transcribe:transcribe,load:load,logmel:logmel,decode:decode};
})();
