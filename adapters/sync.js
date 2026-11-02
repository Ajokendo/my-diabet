/* Pluggable synchronization contract. Current adapter is deliberately local-only. */
(function(w){
  const KEY='my-diabetes-sync-bus-v1';
  function createLocalProvider(){
    let channel=null;
    try{channel='BroadcastChannel' in w?new BroadcastChannel(KEY):null;}catch(e){channel=null;}
    return {
      id:'local-placeholder', mode:'local-only', online:true,
      publish(event){
        try{localStorage.setItem(KEY,JSON.stringify({...event,_ts:Date.now()}));}catch(e){}
        try{channel?.postMessage(event);}catch(e){}
      },
      subscribe(fn){
        const handler=e=>fn(e.data||e); w.addEventListener('storage',handler); if(channel)channel.onmessage=handler;
        return ()=>{w.removeEventListener('storage',handler);if(channel)channel.close();};
      },
      close(){try{channel?.close();}catch(e){}}
    };
  }
  w.DMSync={VERSION:'SYNC-1.0',createLocalProvider,createCloudProvider(){throw new Error('Cloud sync provider is not configured in this local build.');}};
})(window);
