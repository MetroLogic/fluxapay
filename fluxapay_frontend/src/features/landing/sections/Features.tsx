import { Shield, Zap, Globe, BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";

export const Features = () => {
  const t = useTranslations('features');

  const features = [
    {
      icon: Zap,
      title: t('instant.title'),
      description: t('instant.description'),
      bg: "bg-amber-500/10 text-amber-500",
      color: "text-amber-500"
    },
    {
      icon: Globe,
      title: t('globalReach.title'),
      description: t('globalReach.description'),
      bg: "bg-blue-500/10 text-blue-500",
      color: "text-blue-500"
    },
    {
      icon: Shield,
      title: t('security.title'),
      description: t('security.description'),
      bg: "bg-emerald-500/10 text-emerald-500",
      color: "text-emerald-500"
    },
    {
      icon: BarChart3,
      title: t('analytics.title'),
      description: t('analytics.description'),
      bg: "bg-purple-500/10 text-purple-500",
      color: "text-purple-500"
    }
  ];

  return (
    <section id="features" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('sectionTitle')}</h2>
          <p className="text-muted-foreground">
            {t('sectionDescription')}
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
