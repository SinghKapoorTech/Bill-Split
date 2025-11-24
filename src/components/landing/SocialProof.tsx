export function SocialProof() {
  const stats = [
    {
      number: '5,000+',
      label: 'Bills Split',
      gradient: 'from-cyan-500 to-blue-500',
    },
    {
      number: '500+',
      label: 'Happy Users',
      gradient: 'from-blue-500 to-purple-500',
    },
  ];

  return (
    <section className="py-12 px-8 bg-gradient-to-b from-slate-50 to-white">
      <div className="container mx-auto max-w-4xl">
        <div className="grid md:grid-cols-2 gap-12">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className={`text-6xl font-extrabold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent mb-2`}>
                {stat.number}
              </div>
              <div className="text-xl text-slate-600 font-medium">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
