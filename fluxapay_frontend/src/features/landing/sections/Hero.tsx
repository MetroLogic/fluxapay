"use client";

import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Navbar } from "../components/Navbar";

import transfer_icon_1 from "@/assets/transfer-icon-ngn.svg";
import transfer_icon_2 from "@/assets/transfer-icon-khs.svg";
import transfer_icon_3 from "@/assets/transfer-icon-ghs.svg";

const Hero = () => {
  const t = useTranslations("hero");
  
  return (
    <div className="hero">
      <div className="py-8 h-screen flex flex-col relative overflow-hidden ">
        <Navbar />

        <div className="content flex-1 flex items-center justify-center h-full relative z-20 w-full max-w-6xl mx-auto">
          <div className="hero-text-content">
            <div className="w-full hidden lg:block">
              <div className="bg-white rounded-lg py-3 px-6 flex items-center gap-3 absolute top-1/3 left-0">
                <div className="img-icon w-10 h-10 rounded-full overflow-hidden">
                  <Image
                    src={transfer_icon_1}
                    className="w-full h-full"
                    alt="Transfer Icon NGN"
                    width={40}
                    height={40}
                  />
                </div>
                <div className="">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("transfer")}
                  </p>
                  <h4 className="text-sm font-bold text-gray-900">
                    20,000 NGN
                  </h4>
                </div>
              </div>
              <div className="bg-white rounded-lg py-3 px-6 flex items-center gap-3 absolute top-1/6 left-1/2 -translate-x-1/2">
                <div className="img-icon w-10 h-10 rounded-full overflow-hidden">
                  <Image
                    src={transfer_icon_2}
                    className="w-full h-full"
                    alt="Transfer Icon KHS"
                    width={40}
                    height={40}
                  />
                </div>
                <div className="">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("transfer")}
                  </p>
                  <h4 className="text-sm font-bold text-gray-900">5,000 KHS</h4>
                </div>
              </div>
              <div className="bg-white rounded-lg py-3 px-6 flex items-center gap-3 absolute top-1/3 right-0">
                <div className="img-icon w-10 h-10 rounded-full overflow-hidden">
                  <Image
                    src={transfer_icon_3}
                    className="w-full h-full"
                    alt="Transfer Icon GHS"
                    width={40}
                    height={40}
                  />
                </div>
                <div className="">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("transfer")}
                  </p>
                  <h4 className="text-sm font-bold text-gray-900">5,000 GHS</h4>
                </div>
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-5xl font-extrabold  text-white text-[3.5rem] leading-[1] tracking-[-0.04em]">
                {t("mainTitle")} <i className="text-yellow">{t("crypto")}</i> <br />
                {t("mainSubtitle")}
              </h1>
              <p className="py-6 text-[#EFDBFC] text-xl font-medium max-w-2xl mx-auto">
                {t("description")}
              </p>

              <Link
                href="/signup"
                className="px-5 py-2 text-lg font-semibold text-black bg-white rounded-lg transition-all block w-fit mx-auto"
              >
                {t("cta")}
              </Link>
            </div>
          </div>
        </div>

        <div className="hero-fader w-full absolute bottom-0 h-[50vh] left-0 z-10" />
        <div className="hero-bg w-full absolute top-0 h-[80vh] left-0" />
      </div>
    </div>
  );
};

export default Hero;
