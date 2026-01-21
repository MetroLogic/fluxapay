import { Navbar, Hero, Features } from "@/features/landing";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <Features />
      
      {/* Additional sections can be added here */}
      <section id="how-it-works" className="py-24 border-t border-border">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-8">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold mb-4">1</div>
              <h3 className="font-bold mb-2">Connect</h3>
              <p className="text-sm text-muted-foreground">Integrate our API or use our checkout widget in minutes.</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold mb-4">2</div>
              <h3 className="font-bold mb-2">Receive</h3>
              <p className="text-sm text-muted-foreground">Customers pay in their preferred method (crypto or fiat).</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold mb-4">3</div>
              <h3 className="font-bold mb-2">Settle</h3>
              <p className="text-sm text-muted-foreground">Funds are automatically converted and settled to your account.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-12 border-t border-border bg-secondary/20">
        <div className="container mx-auto px-4 text-center md:flex md:justify-between md:items-center">
          <p className="text-sm text-muted-foreground mb-4 md:mb-0">
            &copy; {new Date().getFullYear()} FluxaPay Inc. All rights reserved.
          </p>
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary">Privacy Policy</a>
            <a href="#" className="hover:text-primary">Terms of Service</a>
            <a href="#" className="hover:text-primary">Contact</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
