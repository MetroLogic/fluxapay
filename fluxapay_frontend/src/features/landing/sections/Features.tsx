import { Shield, Zap, Globe, BarChart3 } from "lucide-react";

const features = [
  {
    title: "Instant Settlements",
    description: "Receive funds in your local currency or stablecoins in minutes, not days.",
    icon: Zap,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
  },
  {
    title: "Global Reach",
    description: "Accept payments from customers in over 150 countries with a few lines of code.",
    icon: Globe,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    title: "Bank-Grade Security",
    description: "PCI-DSS compliant infrastructure with advanced fraud detection systems.",
    icon: Shield,
    color: "text-green-500",
    bg: "bg-green-500/10",
  },
  {
    title: "Rich Analytics",
    description: "Deep insights into your business performance with real-time dashboards.",
    icon: BarChart3,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
];

export const Features = () => {
  return (
    <section id="features" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for Global Commerce</h2>
          <p className="text-muted-foreground">
            Everything you need to accept payments and scale your business internationally.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index} 
              className="p-8 rounded-2xl bg-background border border-border hover:border-primary/50 transition-all duration-300 group"
            >
              <div className={`w-12 h-12 rounded-xl ${feature.bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                <feature.icon className={`w-6 h-6 ${feature.color}`} />
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
