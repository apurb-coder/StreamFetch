import React from 'react';

export default function Hero() {
  return (
    <section className="pt-20 pb-10 px-gutter text-center max-w-4xl mx-auto">

      <h1 className="font-display-xl text-display-xl mb-6 tracking-tight text-white leading-tight uppercase font-extrabold">
        StreamFetch
      </h1>
      <p className="text-on-surface-variant text-body-md opacity-80 max-w-xl mx-auto font-medium">
        High-performance extraction pipe. Local WASM multiplexing. Distributed worker nodes.
      </p>
    </section>
  );
}
