import { NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

const systemPrompt = "You are a helpful and knowledgeable assistant for a 'Rate My Professor' service. Your role is to help students find the best professors according to their queries. When a student asks for recommendations, you will analyze their query and provide the top 3 professors that best match their needs using Retrieval-Augmented Generation (RAG). For each recommendation, provide the professor's name, subject area, and a brief review summarizing their strengths based on available data. Make sure the recommendations are relevant and accurate, focusing on the most important criteria specified by the student in their query";


export async function POST(req){
    const data = await req.json();
    const pc = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
    })
    const index = pc.index('rag').namespace('ns1')
    const openai = new OpenAI()

    const text = data[data.length - 1].content
    const embedding = await openai.embeddings.create({
        model :'text-embedding-3-small',
        input : text,
        encoding_format: 'float',


    })

    const results = await index.query({
        topK: 3,
        includeMetadata: true,
        vector: embedding.data[0].Embeddings

    })

    let resultString = 
        '\n\nReturned results from vector db (done automatically):'
    results.matches.forEach((match) => {
        resultString += `\n
        Professor: ${match.id}
        Review: ${match.metadata.reviews}
        Subject: ${match.metadata.subject}
        Stars: ${match.metadata.stars}
        \n\n
        `
    })

    const lastMessage = data[data.length - 1]
    const lastMessageContent = lastMessage.content + resultString
    const lastDataWithoutLastMessage = data.slice(0, data.length - 1)
    const completion = await openai.Completions.create({
        messages: [
            {role: 'system', content: systemPrompt},
            ...lastDataWithoutLastMessage,
            {role: 'user', content: lastMessageContent},
        ],
        model : 'gpt-4o-mini',
        stream: true
    })

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder()
            try{
                for await (const chunk of completion){
                    const content = chunk.choices[0]?.delta?.content
                    if(content){
                        const text = encoder.encode(content)
                        controller.enqueue(text)
                    }
                }
            }
            catch (e){
                controller.error(e)
            }
            finally {
                controller.close()
            }
        }
    })

    return new NextResponse(stream)

}