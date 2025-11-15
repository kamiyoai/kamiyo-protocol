import { useForm } from "react-hook-form";
import { useScrambleText } from "../hooks/useScrambleText";
import React from "react";
import Head from "next/head";

function ScrambleButton() {
    const { text, setIsHovering } = useScrambleText("Send message");

    return (
        <button
            type="submit"
            className="group transition-all duration-300 relative px-6 py-3 bg-transparent text-white text-xs uppercase mb-9 overflow-visible"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            <span className="relative z-10 ml-8 tracking-wider transition-all duration-300 ease-out">
                {text}
            </span>
            <span className="absolute inset-0 border border-dotted cta-gradient skew-x-[-45deg] translate-x-4 transition-all duration-300" />
            <span className="absolute inset-0 border-r border-dotted cta-gradient-border-right skew-x-[-45deg] translate-x-4 transition-all duration-300" />
            <span className="absolute bottom-0 left-[-4px] w-full border-b border-dotted cta-gradient-border-bottom transition-all duration-300" />
        </button>
    );
}

export default function ContactPage() {
    const { register, handleSubmit, reset, formState: { errors } } = useForm();

    const onSubmit = async (data) => {
        try {
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            const result = await response.json();
            if (response.ok) {
                alert(result.message);
                reset();
            } else {
                alert("Failed to send message.");
            }
        } catch (error) {
            console.error("Error sending message:", error);
            alert("Something went wrong.");
        }
    };

    return (
        <div className="text-white bg-black min-h-[calc(100vh-140px)]">
            <Head>
                <title>Inquiries</title>
            </Head>
            <div className="py-10 px-5 mx-auto grid grid-cols-1 md:grid-cols-2 max-w-[1400px] gap-16">

                {/* Left Section - Contact Info */}
                <div className="flex flex-col justify-between">
                    <div>                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;Contact us</p>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25] border-dotted border-b border-cyan pb-8">
              <span className="relative py-1">
                Inquiries &
              </span>
                            <br />
                            comments
                        </h1>
                        <p className="mt-6 text-sm">
                            Please leave us a message. Our team will contact you as soon as possible.
                        </p>
                    </div>

                    <div className="justify-end">
                        <p className="text-sm text-gray-500 uppercase tracking-widest">Email</p>
                        <a href="mailto:kamiyo@kamiyo.ai" className="mb-0 text-sm text-gray-500 hover:text-white font-light">
                            kamiyo@kamiyo.ai
                        </a>
                    </div>
                </div>

                {/* Right Section - Contact Form */}
                <div>
                    <p className="text-sm text-gray-500 uppercase tracking-widest">Contact Form</p>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-6">
                        {/* Name Input */}
                        <div>
                            <input
                                {...register("name", { required: "Name is required" })}
                                placeholder="Your name"
                                className="w-full bg-transparent border-b border-gray-500/25 outline-none text-xs font-light py-2"
                            />
                            {errors.name && <p className="text-magenta text-xs">{errors.name.message}</p>}
                        </div>

                        {/* Email Input */}
                        <div>
                            <input
                                type="email"
                                {...register("email", {
                                    required: "Email is required",
                                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Invalid email address" },
                                })}
                                placeholder="Your email"
                                className="w-full bg-transparent border-t-0 border-l-0 border-r-0 border-b border-gray-500/25 outline-none font-light text-xs py-2"
                            />
                            {errors.email && <p className="text-magenta text-xs">{errors.email.message}</p>}
                        </div>

                        {/* Subject Input */}
                        <div>
                            <input
                                {...register("subject")}
                                placeholder="Subject"
                                className="w-full bg-transparent border-b border-gray-500/25 outline-none font-light text-xs  py-2"
                            />
                        </div>

                        {/* Message Input */}
                        <div>
              <textarea
                  {...register("message", { required: "Message is required" })}
                  placeholder="Your message"
                  className="w-full bg-transparent border rounded-xl border-gray-500/25 outline-none font-light text-xs p-3 resize-none"
                  rows="4"
              />
                            {errors.message && <p className="text-magenta text-xs">{errors.message.message}</p>}
                        </div>

                        {/* Submit Button */}
                        <ScrambleButton />
                    </form>
                </div>

            </div>
        </div>
    );
}
