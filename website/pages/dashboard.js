import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Head from "next/head";
import KamiCard from "../components/KamiCard";
import PayButton from "../components/PayButton";

export default function DashboardPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { session_id } = router.query;
    const [subscription, setSubscription] = useState(null);
    const [kamiList, setKamiList] = useState([]);

    useEffect(() => {
        if (status !== "authenticated" || !session?.user) router.push("/auth/signin");
        if (session_id) {
            // Verify checkout session (optional, via Stripe webhook for security)
            fetch(`/api/payment/verify?session_id=${session_id}`).then(res => res.json()).then(data => console.log(data));
        }

        const fetchData = async () => {
            const subStatus = await fetch("/api/subscription/status").then(res => res.json());
            setSubscription(subStatus);
            if (subStatus.isSubscribed) {
                const kamiRes = await fetch("/api/kami/list"); // New API endpoint below
                if (kamiRes.ok) setKamiList(await kamiRes.json() || []);
            }
        };
        fetchData();
    }, [status, session, session_id]);

    if (status === "loading" || !subscription) return <div>Loading...</div>;

    return (
        <div className="bg-black text-white min-h-screen flex flex-col items-center p-4">
            <Head><title>Kamiyo.ai Dashboard</title></Head>
            <h1 className="text-3xl mb-6">Your Kami Dashboard</h1>
            <p className="text-gray-400 mb-4">Tier: {subscription.tier || "None"}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {kamiList.map((kami) => (
                    <KamiCard
                        key={kami.id}
                        image={kami.image}
                        title={kami.title}
                        japanese={kami.japanese}
                        gen="GEN-1"
                        dotClass="bg-teal-400 rounded-full animate-pulse w-2 h-2"
                    />
                ))}
            </div>
            {subscription.isSubscribed && kamiList.length < getSummonLimit(subscription.tier) && (
                <div className="center-button">
                    <PayButton textOverride="Summon New Kami" onClickOverride={async () => {
                        const newKami = await generateKami(session.user);
                        await fetch("/api/kami/create", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId: session.user.id, ...newKami, tier: subscription.tier }),
                        });
                        setKamiList([...kamiList, newKami]);
                    }} />
                </div>
            )}
            {!subscription.isSubscribed && (
                <div className="center-button">
                    <PayButton textOverride="Subscribe Now" onClickOverride={() => window.location.href = "/pricing"} />
                </div>
            )}
        </div>
    );
}